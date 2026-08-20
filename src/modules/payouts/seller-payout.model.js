import mongoose from 'mongoose';

const sellerPayoutSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  originalAmountKobo: { type: Number, required: true, min: 0 },
  amountKobo: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN', uppercase: true },
  status: { type: String, enum: ['eligible', 'held', 'approved', 'paid', 'cancelled'], default: 'eligible', index: true },
  holdReason: { type: String, trim: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  transferReference: { type: String, trim: true, sparse: true, index: true },
  transferMethod: { type: String, trim: true, maxlength: 120 },
  confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: Date,
}, { timestamps: true });

const SellerPayout = mongoose.model('SellerPayout', sellerPayoutSchema);
export default SellerPayout;
