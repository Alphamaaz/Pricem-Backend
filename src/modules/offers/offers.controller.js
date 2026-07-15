import mongoose from 'mongoose';
import Offer from './offer.model.js';
import Product from '../products/product.model.js';
import { createOrderFromOffer } from '../orders/orders.service.js';

const OPEN_OFFER_STATUSES = ['pending', 'countered'];

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeSelections(selections = []) {
  return selections
    .map((selection) => ({
      name: selection.name.trim(),
      value: selection.value.trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildVariantKey(selections = []) {
  return normalizeSelections(selections)
    .map((selection) => `${selection.name}:${selection.value}`)
    .join('|');
}

function getProductOfferDetails(product, selections = []) {
  const variants = product.variants || [];

  if (variants.length === 0) {
    if (selections.length > 0) {
      return { error: 'This product does not have variants. Remove variantSelections from the request.' };
    }

    return {
      variantSelections: [],
      variantKey: '',
      listedPrice: product.price,
      minimumPrice: product.minPrice,
      availableStock: product.stock,
    };
  }

  const normalizedSelections = normalizeSelections(selections);
  if (normalizedSelections.length !== variants.length) {
    return {
      error: `Select exactly one option for each variant: ${variants.map((variant) => variant.name).join(', ')}`,
    };
  }

  const selectedOptions = [];

  for (const variant of variants) {
    const selection = normalizedSelections.find((item) => item.name === variant.name);
    if (!selection) return { error: `Missing selection for variant '${variant.name}'` };

    const option = variant.options.find((item) => item.value === selection.value);
    if (!option) return { error: `Invalid option '${selection.value}' for variant '${variant.name}'` };

    selectedOptions.push(option);
  }

  const minimumPrices = selectedOptions
    .map((option) => option.minPrice)
    .filter((minPrice) => minPrice !== undefined);

  return {
    variantSelections: normalizedSelections,
    variantKey: buildVariantKey(normalizedSelections),
    listedPrice: Math.max(...selectedOptions.map((option) => option.price)),
    minimumPrice: minimumPrices.length > 0 ? Math.max(...minimumPrices) : undefined,
    availableStock: Math.min(...selectedOptions.map((option) => option.stock)),
  };
}

function getActorRole(offer, user) {
  if (offer.buyer.equals(user._id)) return 'buyer';
  if (offer.seller.equals(user._id)) return 'seller';
  return null;
}

function assertOpenOffer(offer, res) {
  if (!OPEN_OFFER_STATUSES.includes(offer.status)) {
    res.status(400).json({ message: `This offer is already ${offer.status}` });
    return false;
  }

  return true;
}

// POST /api/v1/offers
export async function createOffer(req, res, next) {
  try {
    const { productId, price, variantSelections = [] } = req.body;
    if (!validObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: productId, status: 'active' }).select('+minPrice +variants.options.minPrice');
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

    if (product.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'You cannot negotiate on your own product' });
    }

    const offerDetails = getProductOfferDetails(product, variantSelections);
    if (offerDetails.error) return res.status(422).json({ message: offerDetails.error });

    if (offerDetails.availableStock < 1) {
      return res.status(422).json({ message: 'This product selection is out of stock' });
    }

    if (offerDetails.minimumPrice !== undefined && price < offerDetails.minimumPrice) {
      return res.status(422).json({ message: 'Offer is below the seller minimum acceptable price' });
    }

    const existingOpenOffer = await Offer.findOne({
      product: product._id,
      buyer: req.user._id,
      seller: product.seller,
      variantKey: offerDetails.variantKey,
      status: { $in: OPEN_OFFER_STATUSES },
    });

    if (existingOpenOffer) {
      return res.status(409).json({ message: 'You already have an open offer for this product selection' });
    }

    const offer = await Offer.create({
      product: product._id,
      buyer: req.user._id,
      seller: product.seller,
      productTitle: product.title,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      coverImage: {
        url: product.coverImage.url,
        alt: product.coverImage.alt,
      },
      variantSelections: offerDetails.variantSelections,
      variantKey: offerDetails.variantKey,
      listedPrice: offerDetails.listedPrice,
      currentPrice: price,
      status: 'pending',
      lastProposedBy: 'buyer',
      history: [{ proposedBy: 'buyer', user: req.user._id, price }],
    });

    res.status(201).json({ message: 'Offer submitted to seller', offer });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/offers
export async function listOffers(req, res, next) {
  try {
    const { role, status, page, limit } = req.validatedQuery;
    const filter = {};

    if (role === 'buyer') filter.buyer = req.user._id;
    else if (role === 'seller') filter.seller = req.user._id;
    else filter.$or = [{ buyer: req.user._id }, { seller: req.user._id }];

    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [offers, total] = await Promise.all([
      Offer.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Offer.countDocuments(filter),
    ]);

    res.json({ offers, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/offers/:id/counter
export async function counterOffer(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid offer id' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (!assertOpenOffer(offer, res)) return;

    const actorRole = getActorRole(offer, req.user);
    if (!actorRole) return res.status(403).json({ message: 'You are not part of this offer' });

    if (offer.lastProposedBy === actorRole) {
      return res.status(400).json({ message: 'Wait for the other party to respond before countering again' });
    }

    if (actorRole === 'buyer') {
      const product = await Product.findById(offer.product).select('+minPrice +variants.options.minPrice');
      if (!product) return res.status(404).json({ message: 'Product no longer exists' });

      const offerDetails = getProductOfferDetails(product, offer.variantSelections);
      if (offerDetails.error) return res.status(422).json({ message: offerDetails.error });
      if (offerDetails.minimumPrice !== undefined && req.body.price < offerDetails.minimumPrice) {
        return res.status(422).json({ message: 'Counter offer is below the seller minimum acceptable price' });
      }
    }

    offer.currentPrice = req.body.price;
    offer.status = 'countered';
    offer.lastProposedBy = actorRole;
    offer.history.push({ proposedBy: actorRole, user: req.user._id, price: req.body.price });

    await offer.save();
    res.json({ message: 'Counter offer submitted', offer });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/offers/:id/accept
export async function acceptOffer(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid offer id' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (!assertOpenOffer(offer, res)) return;

    const actorRole = getActorRole(offer, req.user);
    if (!actorRole) return res.status(403).json({ message: 'You are not part of this offer' });

    if (offer.lastProposedBy === actorRole) {
      return res.status(400).json({ message: 'You cannot accept your own latest proposal' });
    }

    const product = await Product.findOne({ _id: offer.product, status: 'active' });
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

    const offerDetails = getProductOfferDetails(product, offer.variantSelections);
    if (offerDetails.error) return res.status(422).json({ message: offerDetails.error });
    if (offerDetails.availableStock < 1) {
      return res.status(422).json({ message: 'This product selection is out of stock' });
    }

    const order = await createOrderFromOffer(offer);

    offer.status = 'accepted';
    offer.acceptedAt = new Date();
    await offer.save();

    await Offer.updateMany(
      {
        _id: { $ne: offer._id },
        product: offer.product,
        buyer: offer.buyer,
        seller: offer.seller,
        variantKey: offer.variantKey,
        status: { $in: OPEN_OFFER_STATUSES },
      },
      { $set: { status: 'rejected', rejectedAt: new Date() } },
    );

    res.json({
      message: 'Offer accepted and order created',
      offer,
      order,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/offers/:id/reject
export async function rejectOffer(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid offer id' });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (!assertOpenOffer(offer, res)) return;

    const actorRole = getActorRole(offer, req.user);
    if (!actorRole) return res.status(403).json({ message: 'You are not part of this offer' });

    offer.status = 'rejected';
    offer.rejectedAt = new Date();
    await offer.save();

    res.json({ message: 'Offer rejected', offer });
  } catch (err) {
    next(err);
  }
}
