import mongoose from 'mongoose';
import Dispute from './dispute.model.js';
import Order from '../orders/order.model.js';
import User from '../users/user.model.js';
import Product from '../products/product.model.js';
import Payment from '../payments/payment.model.js';
import RefundRequest from '../payments/refund-request.model.js';
import SellerPayout from '../payouts/seller-payout.model.js';
import { createPaystackRefund } from '../payments/paystack.service.js';
import { applyRefundEvent, isDemoPaymentMode } from '../payments/payments.service.js';
import { holdPayout } from '../payouts/payouts.service.js';
import { closeOrderWorkspace, recordOrderSystemEvent, reopenOrderWorkspace } from '../chat/chat.service.js';

function roleFor(order, user) {
  if (user.roles.includes('admin')) return 'admin';
  if (order.buyer.equals(user._id)) return 'buyer';
  if (order.seller.equals(user._id)) return 'seller';
  return null;
}

async function loadOrder(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Order.findById(id);
}

function canView(dispute, user) {
  return user.roles.includes('admin') || dispute.buyer.equals(user._id) || dispute.seller.equals(user._id);
}

export async function openDispute(req, res, next) {
  try {
    const order = await loadOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const actorRole = roleFor(order, req.user);
    if (!actorRole) return res.status(403).json({ message: 'You cannot dispute this order' });
    if (order.orderStatus === 'cancelled') {
      return res.status(409).json({ message: 'A cancelled order cannot be reported or disputed' });
    }
    if (order.payoutStatus === 'paid') return res.status(409).json({ message: 'This order has already been paid out' });
    if (order.disputeStatus === 'open' || order.disputeStatus === 'under_review') {
      return res.status(409).json({ message: 'This order already has an active dispute' });
    }

    const dispute = await Dispute.create({
      order: order._id, buyer: order.buyer, seller: order.seller,
      openedBy: req.user._id, openedByRole: actorRole,
      reason: req.body.reason, description: req.body.description,
      evidenceUrls: req.body.evidenceUrls || [],
    });
    order.disputeStatus = 'open';
    order.activeDispute = dispute._id;
    await holdPayout(order, `Dispute ${dispute._id} is open`);
    order.timeline.push({ type: 'dispute_opened', actor: req.user._id, actorRole, message: `Dispute opened: ${req.body.reason}. Financial release is on hold.` });
    await order.save();
    await reopenOrderWorkspace(order._id);
    await recordOrderSystemEvent(order._id, 'A dispute was opened. Buyer and seller may communicate while Pricem admin reviews it. All financial release is on hold.');
    res.status(201).json({ message: 'Dispute opened and financial release placed on hold', dispute, order });
  } catch (err) { next(err); }
}

export async function listDisputes(req, res, next) {
  try {
    const { status, page, limit } = req.validatedQuery;
    const filter = {};
    if (status) filter.status = status;
    if (!req.user.roles.includes('admin')) filter.$or = [{ buyer: req.user._id }, { seller: req.user._id }];
    const skip = (page - 1) * limit;
    const [disputes, total] = await Promise.all([
      Dispute.find(filter).populate('buyer seller', 'fullName email').sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Dispute.countDocuments(filter),
    ]);
    res.json({ disputes, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

export async function getDispute(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid dispute id' });
    const dispute = await Dispute.findById(req.params.id).populate('buyer seller openedBy messages.author resolution.resolvedBy', 'fullName email');
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    if (!canView(dispute, req.user)) return res.status(403).json({ message: 'You cannot view this dispute' });
    res.json({ dispute });
  } catch (err) { next(err); }
}

export async function addDisputeMessage(req, res, next) {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    if (!canView(dispute, req.user)) return res.status(403).json({ message: 'You cannot participate in this dispute' });
    if (dispute.status === 'resolved') return res.status(409).json({ message: 'This dispute is resolved and read-only' });
    const order = await Order.findById(dispute.order);
    const actorRole = roleFor(order, req.user);
    dispute.messages.push({ author: req.user._id, authorRole: actorRole, message: req.body.message, evidenceUrls: req.body.evidenceUrls || [] });
    if (actorRole === 'admin') dispute.status = 'under_review';
    await dispute.save();
    if (actorRole === 'admin') await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: 'under_review' } });
    res.status(201).json({ message: 'Dispute response added', dispute });
  } catch (err) { next(err); }
}

async function submitRefund({ order, dispute, admin, amountKobo }) {
  const payment = await Payment.findById(order.payment);
  if (!payment || !['paid', 'partially_refunded'].includes(payment.status)) {
    return { demoMode: true, directSettlement: true };
  }
  const remaining = order.financials.grossAmountKobo - order.financials.refundedAmountKobo;
  if (amountKobo < 1 || amountKobo > remaining) {
    const err = new Error('Refund amount exceeds the refundable order balance'); err.status = 422; throw err;
  }
  const demoMode = payment.provider === 'demo' || isDemoPaymentMode();
  const providerResponse = demoMode
    ? { data: { id: `demo-refund-${Date.now()}`, refund_reference: `demo-refund-${Date.now()}` } }
    : await createPaystackRefund({
      transaction: payment.reference, amount: amountKobo, currency: payment.currency,
      customer_note: dispute.resolution.decision,
      merchant_note: `Pricem dispute ${dispute._id} resolved by ${admin._id}`,
    });
  const refundRequest = await RefundRequest.create({
    payment: payment._id, order: order._id, amountKobo,
    reason: `Dispute resolution: ${dispute.resolution.decision}`, requestedBy: admin._id,
    providerRefundId: providerResponse.data?.id ? String(providerResponse.data.id) : undefined,
    providerRefundReference: providerResponse.data?.refund_reference, status: 'pending',
  });
  payment.refundStatus = 'pending';
  payment.lastProviderResponse = providerResponse.data;
  await payment.save();
  if (demoMode) {
    await applyRefundEvent(payment.reference, {
      amount: amountKobo,
      refund_reference: refundRequest.providerRefundReference,
      transaction_reference: payment.reference,
    }, 'refund.processed');
  }
  return { demoMode };
}

export async function resolveDispute(req, res, next) {
  try {
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    if (dispute.status === 'resolved') return res.status(409).json({ message: 'This dispute is already resolved' });
    const order = await Order.findById(dispute.order);
    const { outcome, decision } = req.body;
    const remaining = (order?.financials?.grossAmountKobo || 0) - (order?.financials?.refundedAmountKobo || 0);
    const amountKobo = outcome === 'partial_refund' ? Math.round((req.body.amount || 0) * 100) : remaining;

    dispute.resolution = {
      outcome,
      decision,
      resolvedBy: req.user._id,
      resolvedAt: new Date(),
      ...((outcome.includes('refund') || outcome === 'cancel_order') && amountKobo > 0 ? { amountKobo } : {})
    };

    // Accountability disciplinary actions
    if (outcome === 'seller_banned_blacklisted') {
      const sellerUser = await User.findById(dispute.seller);
      if (sellerUser) {
        sellerUser.isActive = false;
        if (sellerUser.sellerProfile) {
          sellerUser.sellerProfile.approvalStatus = 'rejected';
          sellerUser.sellerProfile.rejectionReason = `Blacklisted via Dispute #${dispute._id}: ${decision}`;
        }
        await sellerUser.save();
      }
      await Product.updateMany({ seller: dispute.seller }, { $set: { isActive: false } });
      if (order) order.orderStatus = 'cancelled';
    } else if (outcome === 'seller_penalized_strike') {
      const sellerUser = await User.findById(dispute.seller);
      if (sellerUser && sellerUser.sellerProfile) {
        sellerUser.sellerProfile.strikeCount = (sellerUser.sellerProfile.strikeCount || 0) + 1;
        await sellerUser.save();
      }
    } else if (['full_refund', 'partial_refund', 'cancel_order'].includes(outcome)) {
      if (order) {
        const refund = await submitRefund({ order, dispute, admin: req.user, amountKobo });
        if (!refund.demoMode && !refund.directSettlement) {
          await holdPayout(order, 'Refund is pending after dispute resolution');
        } else {
          const refreshedPayout = await SellerPayout.findOne({ order: order._id });
          order.payoutStatus = refreshedPayout?.status || order.payoutStatus;
        }
        if (outcome !== 'partial_refund') order.orderStatus = 'cancelled';
      }
    } else if (outcome === 'release_seller_payment') {
      if (order) {
        let payout = await SellerPayout.findOne({ order: order._id });
        if (payout && payout.status !== 'paid') {
          payout.status = 'eligible';
          payout.holdReason = undefined;
          await payout.save();
          order.payoutStatus = 'eligible';
        }
      }
    }

    dispute.status = 'resolved';
    if (order) {
      order.disputeStatus = 'resolved';
      order.timeline.push({
        type: 'dispute_resolved',
        actor: req.user._id,
        actorRole: 'admin',
        message: `Pricem resolved the mediation: ${outcome.replaceAll('_', ' ')}. ${decision}`
      });
      await Promise.all([dispute.save(), order.save()]);
      await closeOrderWorkspace(order._id);
      await recordOrderSystemEvent(order._id, `Pricem resolved the mediation: ${outcome.replaceAll('_', ' ')}. ${decision}`);
    } else {
      await dispute.save();
    }

    res.json({ message: 'Dispute resolved and disciplinary/financial records updated', dispute, order });
  } catch (err) { next(err); }
}
