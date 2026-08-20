import mongoose from 'mongoose';

const refundRequestSchema = new mongoose.Schema({
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  amountKobo: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true, trim: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerRefundId: { type: String, trim: true, index: true },
  providerRefundReference: { type: String, trim: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'needs_attention', 'failed', 'processed'],
    default: 'pending',
    index: true,
  },
  processedAt: Date,
}, { timestamps: true });

const RefundRequest = mongoose.model('RefundRequest', refundRequestSchema);
export default RefundRequest;
