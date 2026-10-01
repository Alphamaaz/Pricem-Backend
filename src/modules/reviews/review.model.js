import mongoose from 'mongoose';

export const SELLER_REVIEW_TAGS = ['honest', 'patient', 'friendly', 'responsive', 'professional', 'helpful', 'rude', 'dishonest', 'unresponsive', 'unprofessional'];

const reviewSchema = new mongoose.Schema({
  type: { type: String, enum: ['item', 'seller'], required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true, immutable: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true, immutable: true },
  rating: { type: Number, required: true, min: 1, max: 5, immutable: true },
  text: { type: String, trim: true, maxlength: 20000, immutable: true },
  tags: [{ type: String, enum: SELLER_REVIEW_TAGS, immutable: true }],
  status: { type: String, enum: ['published', 'hidden'], default: 'published', index: true },
}, { timestamps: true });

reviewSchema.index({ order: 1, product: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'item' } });
reviewSchema.index({ order: 1, type: 1 }, { unique: true, partialFilterExpression: { type: 'seller' } });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ seller: 1, status: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
