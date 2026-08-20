import mongoose from 'mongoose';

const disputeMessageSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['buyer', 'seller', 'admin'], required: true },
  message: { type: String, required: true, trim: true, maxlength: 3000 },
  evidenceUrls: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { _id: true });

const disputeSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  openedByRole: { type: String, enum: ['buyer', 'seller', 'admin'], required: true },
  reason: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  evidenceUrls: { type: [String], default: [] },
  status: { type: String, enum: ['open', 'under_review', 'resolved'], default: 'open', index: true },
  messages: { type: [disputeMessageSchema], default: [] },
  resolution: {
    outcome: { type: String, enum: ['full_refund', 'partial_refund', 'release_seller_payment', 'cancel_order'] },
    amountKobo: { type: Number, min: 0 },
    decision: { type: String, trim: true, maxlength: 3000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
}, { timestamps: true });

disputeSchema.index({ order: 1, status: 1 });
const Dispute = mongoose.model('Dispute', disputeSchema);
export default Dispute;
