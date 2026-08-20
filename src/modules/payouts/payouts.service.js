import SellerPayout from './seller-payout.model.js';

export async function ensureEligiblePayout(order) {
  const originalAmountKobo = Math.max(0, order.financials?.sellerPayableKobo || 0);
  const grossAmountKobo = Math.max(0, order.financials?.grossAmountKobo || 0);
  const refundedAmountKobo = Math.min(grossAmountKobo, order.financials?.refundedAmountKobo || 0);
  const refundReductionKobo = grossAmountKobo
    ? Math.round((originalAmountKobo * refundedAmountKobo) / grossAmountKobo)
    : 0;
  const amountKobo = Math.max(0, originalAmountKobo - refundReductionKobo);
  const payout = await SellerPayout.findOneAndUpdate(
    { order: order._id },
    { $setOnInsert: { payment: order.payment, seller: order.seller, originalAmountKobo, amountKobo, status: amountKobo === 0 ? 'cancelled' : 'eligible' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  order.payout = payout._id;
  order.payoutStatus = payout.status;
  return payout;
}

export async function holdPayout(order, reason) {
  const payout = await SellerPayout.findOne({ order: order._id });
  if (payout && !['paid', 'cancelled'].includes(payout.status)) {
    payout.status = 'held';
    payout.holdReason = reason;
    await payout.save();
  }
  order.payoutStatus = 'held';
  return payout;
}
