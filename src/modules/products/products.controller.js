import mongoose from 'mongoose';
import Product from './product.model.js';
import Conversation from '../chat/conversation.model.js';

function isApprovedSeller(user) {
  return (
    user.roles.includes('seller') &&
    user.sellerProfile?.approvalStatus === 'approved'
  );
}

function requireApprovedSeller(req, res) {
  if (!isApprovedSeller(req.user)) {
    res.status(403).json({ message: 'Only approved sellers can manage products' });
    return false;
  }

  return true;
}

function buildProductPayload(body, user, existingProduct) {
  const payload = {};
  const hasVariants = Array.isArray(body.variants) && body.variants.length > 0;

  if (body.title !== undefined) payload.title = body.title;
  if (body.category !== undefined) payload.category = body.category;
  if (hasVariants) {
    const optionPrices = body.variants.flatMap((variant) => variant.options.map((option) => option.price));
    const optionMinPrices = body.variants.flatMap((variant) => (
      variant.options
        .map((option) => option.minPrice)
        .filter((minPrice) => minPrice !== undefined)
    ));

    payload.price = Math.min(...optionPrices);
    payload.stock = body.variants.reduce((total, variant) => (
      total + variant.options.reduce((variantTotal, option) => variantTotal + option.stock, 0)
    ), 0);
    payload.variants = body.variants;

    if (optionMinPrices.length > 0) {
      payload.minPrice = Math.min(...optionMinPrices);
    } else if (body.minPrice !== undefined) {
      payload.minPrice = body.minPrice;
    }
  } else {
    if (body.price !== undefined) payload.price = body.price;
    if (body.minPrice !== undefined) payload.minPrice = body.minPrice;
    if (body.stock !== undefined) payload.stock = body.stock;
    if (body.variants !== undefined) payload.variants = body.variants;
  }
  if (body.condition !== undefined) payload.condition = body.condition;
  if (body.description !== undefined) payload.description = body.description;
  if (body.coverImage !== undefined) payload.coverImage = body.coverImage;
  if (body.images !== undefined) payload.images = body.images;
  if (body.media !== undefined) {
    payload.media = existingProduct?.media?.length
      ? [...existingProduct.media.map((item) => item.toObject?.() ?? item), ...body.media]
      : body.media;
  }
  if (body.status !== undefined) payload.status = body.status;
  if (body.isFeatured !== undefined) payload.isFeatured = body.isFeatured;

  if (
    body.deliveryMode !== undefined ||
    body.estimatedDeliveryDays !== undefined ||
    body.deliveryDetails !== undefined
  ) {
    payload.delivery = {
      mode: body.deliveryMode ?? existingProduct?.delivery?.mode ?? 'buyer_pays_externally',
      estimatedDays: body.estimatedDeliveryDays ?? existingProduct?.delivery?.estimatedDays,
      details: body.deliveryDetails ?? existingProduct?.delivery?.details,
    };
  }

  if (user) {
    payload.seller = user._id;
    payload.storeName = user.sellerProfile.storeName;
    payload.storeSlug = user.sellerProfile.storeSlug;
  }

  return payload;
}

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function getProductSort(sort, search) {
  if (search) return { score: { $meta: 'textScore' } };

  const sortMap = {
    featured: { isFeatured: -1, salesCount: -1, ratingAverage: -1, createdAt: -1 },
    newest: { createdAt: -1 },
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
    popular: { salesCount: -1, viewsCount: -1, createdAt: -1 },
    rating: { ratingAverage: -1, ratingCount: -1, createdAt: -1 },
  };

  return sortMap[sort] || sortMap.featured;
}

// POST /api/v1/products
export async function createProduct(req, res, next) {
  try {
    if (!requireApprovedSeller(req, res)) return;

    const product = await Product.create(buildProductPayload(req.body, req.user));
    res.status(201).json({ message: 'Product listed successfully', product });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products
export async function listProducts(req, res, next) {
  try {
    const {
      page,
      limit,
      category,
      condition,
      minPrice,
      maxPrice,
      search,
      storeSlug,
      inStock,
      sort,
    } = req.validatedQuery;

    const filter = { status: 'active' };
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (storeSlug) filter.storeSlug = storeSlug;
    if (inStock) filter.stock = { $gt: 0 };
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = minPrice;
      if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }
    if (search) filter.$text = { $search: search };

    const skip = (page - 1) * limit;
    const productSort = getProductSort(sort, search);
    const projection = search ? { score: { $meta: 'textScore' } } : undefined;

    const [products, total] = await Promise.all([
      Product.find(filter, projection).sort(productSort).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products/mine
export async function listMyProducts(req, res, next) {
  try {
    if (!requireApprovedSeller(req, res)) return;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find({ seller: req.user._id }).select('+minPrice').sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments({ seller: req.user._id }),
    ]);

    res.json({ products, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/products/:id
export async function getProductById(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, status: 'active' },
      { $inc: { viewsCount: 1 } },
      { new: true },
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ product });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/products/:id
export async function updateProduct(req, res, next) {
  try {
    if (!requireApprovedSeller(req, res)) return;
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: req.params.id, seller: req.user._id }).select('+minPrice');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const incomingMediaCount = req.body.media?.length || 0;
    const existingMediaCount = product.media?.length || product.images?.length || 0;
    if (incomingMediaCount > 0 && existingMediaCount + incomingMediaCount > 7) {
      return res.status(422).json({ message: `A listing can contain at most 8 media files including its cover. You can add ${Math.max(0, 7 - existingMediaCount)} more.` });
    }

    const productHasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const updatingVariants = req.body.variants !== undefined;

    if (productHasVariants && !updatingVariants && (req.body.price !== undefined || req.body.stock !== undefined)) {
      return res.status(422).json({
        message: 'This product has variants. Update price and stock inside variants.options instead of top-level price or stock.',
      });
    }

    if (
      req.body.minPrice !== undefined &&
      req.body.price === undefined &&
      req.body.minPrice > product.price
    ) {
      return res.status(422).json({ message: 'Minimum price cannot be greater than listing price' });
    }

    if (
      req.body.price !== undefined &&
      product.minPrice !== undefined &&
      req.body.price < product.minPrice &&
      req.body.minPrice === undefined
    ) {
      return res.status(422).json({ message: 'Listing price cannot be less than minimum price' });
    }

    const payload = buildProductPayload(req.body, null, product);
    Object.assign(product, payload);

    await product.save();
    res.json({ message: 'Product updated successfully', product });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/products/:id
export async function deleteProduct(req, res, next) {
  try {
    if (!requireApprovedSeller(req, res)) return;
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    product.status = 'inactive';
    await product.save();
    await Conversation.updateMany(
      { product: product._id, scope: 'listing', status: 'open' },
      { $set: { status: 'closed' } },
    );

    res.json({ message: 'Product removed successfully' });
  } catch (err) {
    next(err);
  }
}
