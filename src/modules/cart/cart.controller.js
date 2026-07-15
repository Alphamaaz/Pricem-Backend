import mongoose from 'mongoose';
import Cart from './cart.model.js';
import Product from '../products/product.model.js';

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

function getVariantPurchaseDetails(product, selections = []) {
  const variants = product.variants || [];

  if (variants.length === 0) {
    if (selections.length > 0) {
      return { error: 'This product does not have variants. Remove variantSelections from the request.' };
    }

    return {
      variantSelections: [],
      variantKey: '',
      price: product.price,
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
    if (!selection) {
      return { error: `Missing selection for variant '${variant.name}'` };
    }

    const option = variant.options.find((item) => item.value === selection.value);
    if (!option) {
      return { error: `Invalid option '${selection.value}' for variant '${variant.name}'` };
    }

    selectedOptions.push(option);
  }

  return {
    variantSelections: normalizedSelections,
    variantKey: buildVariantKey(normalizedSelections),
    price: Math.max(...selectedOptions.map((option) => option.price)),
    availableStock: Math.min(...selectedOptions.map((option) => option.stock)),
  };
}

function getCartTotals(cart) {
  const subtotal = cart.items.reduce((total, item) => total + (item.priceSnapshot * item.quantity), 0);
  const totalItems = cart.items.reduce((total, item) => total + item.quantity, 0);

  return { subtotal, totalItems };
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

// GET /api/v1/cart
export async function getCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    res.json({ cart, totals: getCartTotals(cart) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/cart/items
export async function addCartItem(req, res, next) {
  try {
    const { productId, quantity, variantSelections = [] } = req.body;
    if (!validObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: productId, status: 'active' });
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

    if (product.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'You cannot add your own product to cart' });
    }

    const purchaseDetails = getVariantPurchaseDetails(product, variantSelections);
    if (purchaseDetails.error) {
      return res.status(422).json({ message: purchaseDetails.error });
    }

    if (quantity > purchaseDetails.availableStock) {
      return res.status(422).json({
        message: `Only ${purchaseDetails.availableStock} item(s) available in stock for this selection`,
      });
    }

    const cart = await getOrCreateCart(req.user._id);
    const existingItem = cart.items.find((item) => (
      item.product.equals(product._id) &&
      item.variantKey === purchaseDetails.variantKey
    ));

    if (existingItem) {
      const nextQuantity = existingItem.quantity + quantity;
      if (nextQuantity > purchaseDetails.availableStock) {
        return res.status(422).json({
          message: `Cart quantity cannot exceed available stock of ${purchaseDetails.availableStock}`,
        });
      }

      existingItem.quantity = nextQuantity;
      existingItem.priceSnapshot = purchaseDetails.price;
    } else {
      cart.items.push({
        product: product._id,
        seller: product.seller,
        storeName: product.storeName,
        storeSlug: product.storeSlug,
        title: product.title,
        coverImage: {
          url: product.coverImage.url,
          alt: product.coverImage.alt,
        },
        variantSelections: purchaseDetails.variantSelections,
        variantKey: purchaseDetails.variantKey,
        priceSnapshot: purchaseDetails.price,
        quantity,
      });
    }

    await cart.save();
    res.status(201).json({ message: 'Product added to cart', cart, totals: getCartTotals(cart) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/cart/items/:itemId
export async function updateCartItem(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    const product = await Product.findOne({ _id: item.product, status: 'active' });
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

    const purchaseDetails = getVariantPurchaseDetails(product, item.variantSelections);
    if (purchaseDetails.error) {
      return res.status(422).json({ message: purchaseDetails.error });
    }

    if (req.body.quantity > purchaseDetails.availableStock) {
      return res.status(422).json({
        message: `Only ${purchaseDetails.availableStock} item(s) available in stock for this selection`,
      });
    }

    item.quantity = req.body.quantity;
    item.priceSnapshot = purchaseDetails.price;
    await cart.save();

    res.json({ message: 'Cart item updated', cart, totals: getCartTotals(cart) });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/cart/items/:itemId
export async function removeCartItem(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    item.deleteOne();
    await cart.save();

    res.json({ message: 'Cart item removed', cart, totals: getCartTotals(cart) });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/cart
export async function clearCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();

    res.json({ message: 'Cart cleared', cart, totals: getCartTotals(cart) });
  } catch (err) {
    next(err);
  }
}
