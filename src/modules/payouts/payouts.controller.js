import mongoose from 'mongoose';
import SellerPayout from './seller-payout.model.js';
import Order from '../orders/order.model.js';
import LedgerEntry from '../payments/ledger-entry.model.js';
import { recordOrderSystemEvent } from '../chat/chat.service.js';

export async function listPayouts(req, res, next) {
  try {
    const { status, page, limit } = req.validatedQuery;
    const filter = status ? { status } : {};
    const skip = (page - 1) * limit;
    const [payouts, total] = await Promise.all([
      SellerPayout.find(filter).populate('seller', 'fullName email sellerProfile.payoutDetails').populate('order').sort({ createdAt: -1 }).skip(skip).limit(limit),
      SellerPayout.countDocuments(filter),
    ]);
    res.json({ payouts, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

export async function approvePayout(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid payout id' });
    const payout = await SellerPayout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: 'Payout not found' });
    if (payout.status !== 'eligible') return res.status(409).json({ message: 'Only an eligible payout can be approved' });
    const order = await Order.findById(payout.order);
    if (!order || order.orderStatus !== 'completed' || order.disputeStatus === 'open' || order.disputeStatus === 'under_review') {
      return res.status(409).json({ message: 'Payout is blocked until the order is completed and undisputed' });
    }
    payout.status = 'approved'; payout.approvedBy = req.user._id; payout.approvedAt = new Date();
    order.payoutStatus = 'approved';
    order.timeline.push({ type: 'payout_approved', actor: req.user._id, actorRole: 'admin', message: 'Admin approved the seller payout for manual transfer.' });
    await Promise.all([payout.save(), order.save()]);
    await recordOrderSystemEvent(order._id, 'Pricem approved the seller payout. Manual transfer confirmation is pending.');
    res.json({ message: 'Seller payout approved for manual transfer', payout });
  } catch (err) { next(err); }
}

export async function confirmPayout(req, res, next) {
  try {
    const payout = await SellerPayout.findById(req.params.id);
    if (!payout) return res.status(404).json({ message: 'Payout not found' });
    if (payout.status !== 'approved') return res.status(409).json({ message: 'Only an approved payout can be confirmed paid' });
    payout.status = 'paid'; payout.transferReference = req.body.transferReference;
    payout.transferMethod = req.body.transferMethod; payout.confirmedBy = req.user._id; payout.paidAt = new Date();
    const order = await Order.findById(payout.order);
    order.payoutStatus = 'paid';
    order.timeline.push({ type: 'payout_paid', actor: req.user._id, actorRole: 'admin', message: `Seller payout transferred via ${req.body.transferMethod}. Reference: ${req.body.transferReference}.` });
    await LedgerEntry.create({
      idempotencyKey: `payout:${payout._id}:paid`, order: payout.order, payment: payout.payment, seller: payout.seller,
      entryType: 'payout', direction: 'debit', amountKobo: payout.amountKobo, currency: payout.currency,
      providerReference: req.body.transferReference, description: `Manual seller payout via ${req.body.transferMethod}`,
    });
    await Promise.all([payout.save(), order.save()]);
    await recordOrderSystemEvent(order._id, 'Seller payout transfer was confirmed by Pricem admin.');
    res.json({ message: 'Seller payout marked as paid', payout });
  } catch (err) { next(err); }
}
