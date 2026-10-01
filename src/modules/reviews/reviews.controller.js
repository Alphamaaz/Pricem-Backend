import mongoose from 'mongoose';
import Review, { SELLER_REVIEW_TAGS } from './review.model.js';
import Order from '../orders/order.model.js';
import Product from '../products/product.model.js';
import User from '../users/user.model.js';

function eligibleOrder(orderId, buyer) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) return Order.findOne({ _id: null });
  return Order.findOne({ _id: orderId, buyer, orderStatus: 'completed', paymentStatus: { $in: ['paid', 'partially_refunded'] } });
}

function hasProduct(order, productId) {
  return order.items.some((item) => String(item.product) === String(productId));
}

export async function createItemReview(req, res, next) {
  const session = await mongoose.startSession();
  try {
    let review;
    await session.withTransaction(async () => {
      const order = await eligibleOrder(req.params.orderId, req.user._id).session(session);
      if (!order) { const error = new Error('Only the buyer can review items from a completed paid order'); error.status = 403; throw error; }
      if (!mongoose.Types.ObjectId.isValid(req.params.productId) || !hasProduct(order, req.params.productId)) { const error = new Error('This product is not part of the order'); error.status = 422; throw error; }
      [review] = await Review.create([{ type: 'item', order: order._id, buyer: req.user._id, seller: order.seller, product: req.params.productId, rating: req.body.rating, text: req.body.text, tags: [] }], { session });
      await Product.updateOne({ _id: req.params.productId }, [{ $set: { ratingCount: { $add: ['$ratingCount', 1] }, ratingTotal: { $add: [{ $ifNull: ['$ratingTotal', 0] }, req.body.rating] } } }, { $set: { ratingAverage: { $round: [{ $divide: ['$ratingTotal', '$ratingCount'] }, 2] } } }], { session });
    });
    res.status(201).json({ message: 'Item review published', review });
  } catch (err) { next(err); } finally { await session.endSession(); }
}

export async function createSellerReview(req, res, next) {
  const session = await mongoose.startSession();
  try {
    let review;
    await session.withTransaction(async () => {
      const order = await eligibleOrder(req.params.orderId, req.user._id).session(session);
      if (!order) { const error = new Error('Only the buyer can rate the seller after a completed paid order'); error.status = 403; throw error; }
      [review] = await Review.create([{ type: 'seller', order: order._id, buyer: req.user._id, seller: order.seller, rating: req.body.rating, text: req.body.text, tags: req.body.tags }], { session });
      await User.updateOne({ _id: order.seller }, [{ $set: { 'sellerProfile.ratingCount': { $add: [{ $ifNull: ['$sellerProfile.ratingCount', 0] }, 1] }, 'sellerProfile.ratingTotal': { $add: [{ $ifNull: ['$sellerProfile.ratingTotal', 0] }, req.body.rating] } } }, { $set: { 'sellerProfile.ratingAverage': { $round: [{ $divide: ['$sellerProfile.ratingTotal', '$sellerProfile.ratingCount'] }, 2] } } }], { session });
    });
    res.status(201).json({ message: 'Seller rating published', review });
  } catch (err) { next(err); } finally { await session.endSession(); }
}

async function list(filter, query, res) {
  const skip = (query.page - 1) * query.limit;
  const [reviews, total] = await Promise.all([Review.find({ ...filter, status: 'published' }).populate('buyer', 'fullName').sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(), Review.countDocuments({ ...filter, status: 'published' })]);
  res.json({ reviews, total, page: query.page, pages: Math.ceil(total / query.limit) });
}

export async function listProductReviews(req, res, next) { try { await list({ type: 'item', product: req.params.productId }, req.validatedQuery, res); } catch (err) { next(err); } }
export async function listSellerReviews(req, res, next) { try { await list({ type: 'seller', seller: req.params.sellerId }, req.validatedQuery, res); } catch (err) { next(err); } }

export async function getOrderReviewEligibility(req, res, next) {
  try {
    const order = await eligibleOrder(req.params.orderId, req.user._id);
    if (!order) return res.json({ eligible: false, itemReviews: [], sellerReview: null, tags: SELLER_REVIEW_TAGS });
    const reviews = await Review.find({ order: order._id, buyer: req.user._id }).lean();
    res.json({ eligible: true, itemReviews: reviews.filter((review) => review.type === 'item'), sellerReview: reviews.find((review) => review.type === 'seller') || null, tags: SELLER_REVIEW_TAGS });
  } catch (err) { next(err); }
}
