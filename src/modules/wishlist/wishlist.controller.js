import mongoose from 'mongoose';
import Wishlist from './wishlist.model.js';
import Product from '../products/product.model.js';

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function getOrCreateWishlist(userId) {
  let wishlist = await Wishlist.findOne({ user: userId }).populate('items.product');
  if (!wishlist) wishlist = await Wishlist.create({ user: userId, items: [] });
  return wishlist;
}

// GET /api/v1/wishlist
export async function getWishlist(req, res, next) {
  try {
    const wishlist = await getOrCreateWishlist(req.user._id);
    res.json({ wishlist });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/wishlist/items
export async function addWishlistItem(req, res, next) {
  try {
    const { productId } = req.body;
    if (!validObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: productId, status: 'active' });
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });

    if (product.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'You cannot add your own product to wishlist' });
    }

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $addToSet: { items: { product: product._id } } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).populate('items.product');

    res.status(201).json({ message: 'Product added to wishlist', wishlist });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/wishlist/items/:productId
export async function removeWishlistItem(req, res, next) {
  try {
    if (!validObjectId(req.params.productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $pull: { items: { product: req.params.productId } } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).populate('items.product');

    res.json({ message: 'Product removed from wishlist', wishlist });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/wishlist
export async function clearWishlist(req, res, next) {
  try {
    const wishlist = await Wishlist.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [] } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    res.json({ message: 'Wishlist cleared', wishlist });
  } catch (err) {
    next(err);
  }
}
