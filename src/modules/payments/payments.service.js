import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../orders/order.model.js';
import Payment from './payment.model.js';
import LedgerEntry from './ledger-entry.model.js';
import RefundRequest from './refund-request.model.js';
import { recordOrderSystemEvent } from '../chat/chat.service.js';
import { initializePaystackTransaction } from './paystack.service.js';
import SellerPayout from '../payouts/seller-payout.model.js';
import Product from '../products/product.model.js';
import { releaseExpiredOfferReservations } from '../orders/orders.service.js';

function nairaToKobo(amount) {
  return Math.round(Number(amount) * 100);
}

function platformFeeFor(amountKobo) {
  const percent = Math.max(0, Number(process.env.PLATFORM_FEE_PERCENT) || 0);
  return Math.round((amountKobo * percent) / 100);
}

function distribute(total, allocations) {
  if (!total) return allocations.map(() => 0);
  const gross = allocations.reduce((sum, item) => sum + item.grossAmountKobo, 0);
  let assigned = 0;
  return allocations.map((item, index) => {
    if (index === allocations.length - 1) return total - assigned;
    const share = Math.round((total * item.grossAmountKobo) / gross);
    assigned += share;
    return share;
  });
}

function paymentReference() {
  return `pricem-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function callbackUrl() {
  if (process.env.PAYSTACK_CALLBACK_URL) return process.env.PAYSTACK_CALLBACK_URL;
  const client = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim();
  return `${client}/payments/callback`;
}

export function isDemoPaymentMode() {
  return process.env.PAYMENT_MODE === 'demo';
}

export async function initializeOrderPayment({ orderIds, buyer }) {
  const uniqueIds = [...new Set(orderIds)];
  if (uniqueIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    const err = new Error('One or more order ids are invalid');
    err.status = 400;
    throw err;
  }

  const orders = await Order.find({ _id: { $in: uniqueIds }, buyer: buyer._id });
  if (orders.length !== uniqueIds.length) {
    const err = new Error('One or more orders were not found or do not belong to you');
    err.status = 404;
    throw err;
  }
  if (orders.some((order) => order.paymentStatus !== 'pending' || order.orderStatus !== 'pending_payment')) {
    const err = new Error('Only unpaid pending orders can be initialized for payment');
    err.status = 409;
    throw err;
  }
  for (const order of orders.filter((item) => item.source === 'offer')) {
    const address = order.shippingAddress;
    if (!address?.fullName || !address?.phone || !address?.addressLine1 || !address?.city || !address?.country) {
      const err = new Error('Add the shipping address before paying for this negotiated order');
      err.status = 422;
      throw err;
    }
    if (order.inventoryReservation?.status !== 'reserved' || !order.inventoryReservation.expiresAt || order.inventoryReservation.expiresAt <= new Date()) {
      await releaseExpiredOfferReservations();
      const err = new Error('This negotiated-price reservation has expired');
      err.status = 409;
      throw err;
    }
    const productIds = order.items.map((item) => item.product);
    const existingProducts = await Product.countDocuments({ _id: { $in: productIds } });
    if (existingProducts !== new Set(productIds.map(String)).size) {
      const err = new Error('An item in this negotiated order is no longer available');
      err.status = 409;
      throw err;
    }
  }

  const allocations = orders.map((order) => {
    const grossAmountKobo = nairaToKobo(order.total);
    const platformFeeKobo = platformFeeFor(grossAmountKobo);
    return {
      order: order._id,
      grossAmountKobo,
      platformFeeKobo,
      processorFeeKobo: 0,
      sellerPayableKobo: grossAmountKobo - platformFeeKobo,
    };
  });
  const expectedAmountKobo = allocations.reduce((sum, item) => sum + item.grossAmountKobo, 0);
  if (expectedAmountKobo < 1) {
    const err = new Error('Payment amount must be greater than zero');
    err.status = 422;
    throw err;
  }

  const reference = paymentReference();
  const demoMode = isDemoPaymentMode();
  const providerResponse = demoMode
    ? { data: { access_code: `demo-${reference}`, authorization_url: `${callbackUrl()}?reference=${encodeURIComponent(reference)}&demo=1` } }
    : await initializePaystackTransaction({
      email: buyer.email,
      amount: String(expectedAmountKobo),
      currency: 'NGN',
      reference,
      callback_url: callbackUrl(),
      metadata: JSON.stringify({ buyerId: String(buyer._id), orderIds: orders.map((order) => String(order._id)) }),
    });

  const payment = await Payment.create({
    buyer: buyer._id,
    provider: demoMode ? 'demo' : 'paystack',
    orders: orders.map((order) => order._id),
    reference,
    accessCode: providerResponse.data.access_code,
    authorizationUrl: providerResponse.data.authorization_url,
    expectedAmountKobo,
    status: 'pending',
    allocations,
    lastProviderResponse: providerResponse.data,
  });

  await Order.updateMany(
    { _id: { $in: payment.orders }, paymentStatus: 'pending' },
    { $set: { payment: payment._id, paymentReference: reference } },
  );
  return payment;
}

async function createLedgerEntry(data) {
  try {
    return await LedgerEntry.create(data);
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
}

export async function applySuccessfulPayment(reference, providerData) {
  const payment = await Payment.findOne({ reference });
  if (!payment) {
    const err = new Error('Unknown payment reference');
    err.status = 404;
    throw err;
  }
  const amount = Number(providerData.amount);
  const currency = String(providerData.currency || '').toUpperCase();
  if (providerData.status !== 'success' || amount !== payment.expectedAmountKobo || currency !== payment.currency) {
    const err = new Error('Payment status, amount, or currency did not match the initialized transaction');
    err.status = 422;
    throw err;
  }

  const totalProcessorFee = Math.max(0, Number(providerData.fees) || 0);
  const processorShares = distribute(totalProcessorFee, payment.allocations);
  const sellerBearsFee = process.env.PAYSTACK_FEE_BEARER === 'seller';
  const paidAt = providerData.paid_at ? new Date(providerData.paid_at) : new Date();

  for (let index = 0; index < payment.allocations.length; index += 1) {
    const allocation = payment.allocations[index];
    allocation.processorFeeKobo = processorShares[index];
    allocation.sellerPayableKobo = Math.max(
      0,
      allocation.grossAmountKobo - allocation.platformFeeKobo - (sellerBearsFee ? allocation.processorFeeKobo : 0),
    );
    const order = await Order.findById(allocation.order);
    if (!order) continue;
    const wasPaid = order.paymentStatus === 'paid';
    order.payment = payment._id;
    order.paymentReference = reference;
    order.paymentStatus = 'paid';
    if (order.orderStatus === 'pending_payment') order.orderStatus = 'paid';
    if (order.source === 'offer' && order.inventoryReservation?.status === 'reserved') {
      order.inventoryReservation.status = 'committed';
      order.inventoryReservation.committedAt = paidAt;
    }
    order.paidAt = paidAt;
    order.financials = {
      grossAmountKobo: allocation.grossAmountKobo,
      platformFeeKobo: allocation.platformFeeKobo,
      processorFeeKobo: allocation.processorFeeKobo,
      sellerPayableKobo: allocation.sellerPayableKobo,
      refundedAmountKobo: order.financials?.refundedAmountKobo || 0,
    };
    if (!wasPaid) {
      order.timeline.push({ type: 'payment_confirmed', actorRole: 'system', message: `${payment.provider === 'demo' ? 'Demo payment' : 'Paystack'} confirmed item payment. Seller fulfilment can begin.` });
    }
    await order.save();

    const base = { order: order._id, payment: payment._id, seller: order.seller, currency: payment.currency, providerReference: reference };
    await createLedgerEntry({ ...base, idempotencyKey: `${reference}:${order._id}:payment`, entryType: 'payment_received', direction: 'credit', amountKobo: allocation.grossAmountKobo, description: 'Buyer item payment received into platform hold' });
    await createLedgerEntry({ ...base, idempotencyKey: `${reference}:${order._id}:seller`, entryType: 'seller_payable', direction: 'credit', amountKobo: allocation.sellerPayableKobo, description: 'Seller payable balance held until eligible for manual release' });
    if (allocation.platformFeeKobo > 0) await createLedgerEntry({ ...base, idempotencyKey: `${reference}:${order._id}:platform-fee`, entryType: 'platform_fee', direction: 'credit', amountKobo: allocation.platformFeeKobo, description: 'Pricem platform fee' });
    if (allocation.processorFeeKobo > 0) await createLedgerEntry({ ...base, idempotencyKey: `${reference}:${order._id}:processor-fee`, entryType: 'processor_fee', direction: 'debit', amountKobo: allocation.processorFeeKobo, description: 'Paystack processing fee' });
    if (!wasPaid) await recordOrderSystemEvent(order._id, `${payment.provider === 'demo' ? 'Demo payment' : 'Paystack'} confirmed item payment. The seller can now begin fulfilment.`);
  }

  payment.status = 'paid';
  payment.paidAmountKobo = amount;
  payment.providerTransactionId = String(providerData.id || '');
  payment.channel = providerData.channel;
  payment.paidAt = paidAt;
  payment.allocations = payment.allocations;
  payment.lastProviderResponse = providerData;
  await payment.save();
  return payment;
}

export async function applyRefundEvent(reference, providerData, eventType) {
  const payment = await Payment.findOne({ reference });
  if (!payment) return null;
  const statusByEvent = {
    'refund.pending': 'pending',
    'refund.processing': 'processing',
    'refund.needs-attention': 'needs_attention',
    'refund.failed': 'failed',
    'refund.processed': 'processed',
  };
  payment.refundStatus = statusByEvent[eventType] || payment.refundStatus;
  const refundReference = providerData.refund_reference;
  let refundRequest = refundReference
    ? await RefundRequest.findOne({ payment: payment._id, providerRefundReference: refundReference })
    : null;
  if (!refundRequest) {
    refundRequest = await RefundRequest.findOne({
      payment: payment._id,
      amountKobo: Math.max(0, Number(providerData.amount) || 0),
      status: { $in: ['pending', 'processing', 'needs_attention'] },
    }).sort({ createdAt: 1 });
  }
  if (refundRequest) {
    refundRequest.status = statusByEvent[eventType] || refundRequest.status;
    if (refundReference) refundRequest.providerRefundReference = refundReference;
  }
  if (eventType !== 'refund.processed') {
    if (refundRequest) await refundRequest.save();
    await payment.save();
    return payment;
  }

  const amount = Math.max(0, Number(providerData.amount) || 0);
  if (!refundRequest) {
    const err = new Error('Refund webhook could not be matched to an approved order refund');
    err.status = 409;
    throw err;
  }
  payment.refundedAmountKobo = Math.min(payment.expectedAmountKobo, payment.refundedAmountKobo + amount);
  payment.status = payment.refundedAmountKobo >= payment.expectedAmountKobo ? 'refunded' : 'partially_refunded';
  const order = await Order.findById(refundRequest.order);
  if (order) {
    order.financials.refundedAmountKobo = Math.min(order.financials.grossAmountKobo, (order.financials.refundedAmountKobo || 0) + amount);
    order.paymentStatus = order.financials.refundedAmountKobo >= order.financials.grossAmountKobo ? 'refunded' : 'partially_refunded';
    const payout = await SellerPayout.findOne({ order: order._id });
    if (payout && payout.status !== 'paid') {
      const gross = Math.max(1, order.financials.grossAmountKobo);
      const proportionalReduction = Math.round((payout.originalAmountKobo * amount) / gross);
      const sellerReduction = Math.min(payout.amountKobo, proportionalReduction);
      payout.amountKobo -= sellerReduction;
      payout.status = payout.amountKobo === 0 ? 'cancelled' : 'eligible';
      payout.holdReason = undefined;
      order.payoutStatus = payout.status;
      await payout.save();
      if (sellerReduction > 0) await createLedgerEntry({
        idempotencyKey: `${refundRequest._id}:payout-adjustment`, order: order._id, payment: payment._id,
        seller: order.seller, entryType: 'payout_adjustment', direction: 'debit', amountKobo: sellerReduction,
        currency: payment.currency, providerReference: providerData.refund_reference || reference,
        description: 'Seller payout reduced after processed refund',
      });
    }
    await order.save();
    await createLedgerEntry({
      idempotencyKey: `${refundRequest._id}:refund-processed`,
      order: order._id,
      payment: payment._id,
      seller: order.seller,
      entryType: 'refund',
      direction: 'debit',
      amountKobo: amount,
      currency: payment.currency,
      providerReference: providerData.refund_reference || reference,
      description: payment.provider === 'demo' ? 'Demo refund processed' : 'Paystack refund processed',
    });
  }
  refundRequest.status = 'processed';
  refundRequest.processedAt = new Date();
  await refundRequest.save();
  await payment.save();
  return payment;
}
