import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true, immutable: true },
  promoter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true, immutable: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  clicks: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
schema.index({ promoter: 1, product: 1 }, { unique: true });
export default mongoose.model('ReferralLink', schema);
