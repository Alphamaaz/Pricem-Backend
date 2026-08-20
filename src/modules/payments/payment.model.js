import mongoose from 'mongoose';

const allocationSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  grossAmountKobo: { type: Number, required: true, min: 0 },
  platformFeeKobo: { type: Number, required: true, min: 0, default: 0 },
  processorFeeKobo: { type: Number, required: true, min: 0, default: 0 },
  sellerPayableKobo: { type: Number, required: true, min: 0 },
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }],
  provider: { type: String, enum: ['paystack', 'demo'], default: 'paystack', required: true },
  reference: { type: String, required: true, unique: true, index: true },
  accessCode: { type: String, select: false },
  authorizationUrl: { type: String, trim: true },
  expectedAmountKobo: { type: Number, required: true, min: 1 },
  paidAmountKobo: { type: Number, min: 0 },
  currency: { type: String, default: 'NGN', uppercase: true },
  status: {
    type: String,
    enum: ['initialized', 'pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
    default: 'initialized',
    index: true,
  },
  providerTransactionId: { type: String, trim: true },
  channel: { type: String, trim: true },
  paidAt: Date,
  failedAt: Date,
  refundedAmountKobo: { type: Number, min: 0, default: 0 },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processing', 'needs_attention', 'failed', 'processed'],
    default: 'none',
  },
  allocations: { type: [allocationSchema], default: [] },
  lastProviderResponse: { type: mongoose.Schema.Types.Mixed, select: false },
}, { timestamps: true });

paymentSchema.index({ orders: 1, status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
