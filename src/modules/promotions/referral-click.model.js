import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true, immutable: true },
  referralLink: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralLink', required: true, index: true, immutable: true },
  promoter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true, immutable: true },
  visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, immutable: true },
  fingerprintHash: { type: String, required: true, index: true, immutable: true },
  clickedAt: { type: Date, default: Date.now, immutable: true },
  expiresAt: { type: Date, required: true, index: true, immutable: true },
  attributedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
}, { timestamps: false });
schema.index({ product: 1, visitor: 1, clickedAt: -1 });
export default mongoose.model('ReferralClick', schema);
