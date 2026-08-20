import mongoose from 'mongoose';

const ledgerEntrySchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  entryType: {
    type: String,
    enum: ['payment_received', 'platform_fee', 'processor_fee', 'seller_payable', 'refund', 'payout', 'payout_adjustment'],
    required: true,
    index: true,
  },
  direction: { type: String, enum: ['credit', 'debit'], required: true },
  amountKobo: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN', uppercase: true },
  providerReference: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  occurredAt: { type: Date, default: Date.now, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

function immutableError(next) {
  next(new Error('Ledger entries are append-only and cannot be changed or deleted'));
}

ledgerEntrySchema.pre('updateOne', immutableError);
ledgerEntrySchema.pre('updateMany', immutableError);
ledgerEntrySchema.pre('findOneAndUpdate', immutableError);
ledgerEntrySchema.pre('deleteOne', immutableError);
ledgerEntrySchema.pre('deleteMany', immutableError);
ledgerEntrySchema.pre('findOneAndDelete', immutableError);

const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
export default LedgerEntry;
