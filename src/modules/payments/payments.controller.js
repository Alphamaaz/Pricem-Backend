import mongoose from 'mongoose';
import Payment from './payment.model.js';
import WebhookEvent from './webhook-event.model.js';
import RefundRequest from './refund-request.model.js';
import Order from '../orders/order.model.js';
import {
  createPaystackRefund,
  isValidPaystackSignature,
  verifyPaystackTransaction,
  webhookEventKey,
} from './paystack.service.js';
import { applyRefundEvent, applySuccessfulPayment, initializeOrderPayment, isDemoPaymentMode } from './payments.service.js';

function paymentResponse(payment) {
  return {
    _id: payment._id,
    provider: payment.provider,
    reference: payment.reference,
    authorizationUrl: payment.authorizationUrl,
    expectedAmountKobo: payment.expectedAmountKobo,
    currency: payment.currency,
    status: payment.status,
    orders: payment.orders,
    paidAt: payment.paidAt,
    refundStatus: payment.refundStatus,
    refundedAmountKobo: payment.refundedAmountKobo,
  };
}

export async function initializePayment(req, res, next) {
  try {
    const payment = await initializeOrderPayment({ orderIds: req.body.orderIds, buyer: req.user });
    res.status(201).json({ message: payment.provider === 'demo' ? 'Demo payment initialized' : 'Paystack transaction initialized', payment: paymentResponse(payment) });
  } catch (err) {
    next(err);
  }
}

export async function verifyPayment(req, res, next) {
  try {
    const payment = await Payment.findOne({ reference: req.params.reference, buyer: req.user._id });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const providerResponse = payment.provider === 'demo'
      ? { data: { id: `demo-${payment._id}`, status: 'success', amount: payment.expectedAmountKobo, currency: payment.currency, fees: 0, channel: 'demo', paid_at: new Date().toISOString() } }
      : await verifyPaystackTransaction(payment.reference);
    if (providerResponse.data.status === 'success') {
      await applySuccessfulPayment(payment.reference, providerResponse.data);
    } else if (['failed', 'abandoned', 'reversed'].includes(providerResponse.data.status)) {
      payment.status = 'failed';
      payment.failedAt = new Date();
      payment.lastProviderResponse = providerResponse.data;
      await payment.save();
    }
    const current = await Payment.findById(payment._id);
    res.json({ message: 'Payment status verified', payment: paymentResponse(current) });
  } catch (err) {
    next(err);
  }
}

export async function getPayment(req, res, next) {
  try {
    const filter = { reference: req.params.reference };
    if (!req.user.roles.includes('admin')) filter.buyer = req.user._id;
    const payment = await Payment.findOne(filter);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ payment: paymentResponse(payment) });
  } catch (err) {
    next(err);
  }
}

export async function initiateRefund(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.paymentId)) {
      return res.status(400).json({ message: 'Invalid payment id' });
    }
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment || !['paid', 'partially_refunded'].includes(payment.status)) {
      return res.status(409).json({ message: 'Only a paid payment can be refunded' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.body.orderId) || !payment.orders.some((id) => id.equals(req.body.orderId))) {
      return res.status(422).json({ message: 'Refund order does not belong to this payment' });
    }
    const order = await Order.findById(req.body.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const orderRemaining = order.financials.grossAmountKobo - order.financials.refundedAmountKobo;
    const amountKobo = req.body.amount === undefined ? orderRemaining : Math.round(req.body.amount * 100);
    if (amountKobo < 1 || amountKobo > orderRemaining) {
      return res.status(422).json({ message: 'Refund amount exceeds the refundable balance' });
    }

    const demoMode = payment.provider === 'demo' || isDemoPaymentMode();
    const providerResponse = demoMode
      ? { data: { id: `demo-refund-${Date.now()}`, refund_reference: `demo-refund-${Date.now()}` } }
      : await createPaystackRefund({
        transaction: payment.reference, amount: amountKobo, currency: payment.currency,
        customer_note: req.body.reason, merchant_note: `PriceAm admin ${req.user._id}: ${req.body.reason}`,
      });
    payment.refundStatus = 'pending';
    payment.lastProviderResponse = providerResponse.data;
    await payment.save();
    const refundRequest = await RefundRequest.create({
      payment: payment._id,
      order: order._id,
      amountKobo,
      reason: req.body.reason,
      requestedBy: req.user._id,
      providerRefundId: providerResponse.data?.id ? String(providerResponse.data.id) : undefined,
      providerRefundReference: providerResponse.data?.refund_reference || undefined,
      status: 'pending',
    });
    if (demoMode) {
      await applyRefundEvent(payment.reference, { amount: amountKobo, refund_reference: refundRequest.providerRefundReference, transaction_reference: payment.reference }, 'refund.processed');
    }
    const current = await Payment.findById(payment._id);
    res.status(demoMode ? 200 : 202).json({ message: demoMode ? 'Demo refund processed' : 'Refund submitted to Paystack', payment: paymentResponse(current) });
  } catch (err) {
    next(err);
  }
}

export async function paystackWebhook(req, res) {
  const signature = req.get('x-paystack-signature');
  if (!isValidPaystackSignature(req.body, signature)) {
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Invalid webhook payload' });
  }

  const eventKey = webhookEventKey(req.body);
  const reference = payload.data?.reference || payload.data?.transaction_reference;
  let receipt = await WebhookEvent.findOne({ eventKey });
  if (receipt?.status === 'processed') return res.sendStatus(200);
  if (!receipt) {
    try {
      receipt = await WebhookEvent.create({ eventKey, eventType: payload.event, reference, payload });
    } catch (err) {
      if (err.code !== 11000) throw err;
      receipt = await WebhookEvent.findOne({ eventKey });
      if (receipt?.status === 'processed') return res.sendStatus(200);
    }
  } else {
    receipt.status = 'processing';
    receipt.error = undefined;
    await receipt.save();
  }

  try {
    if (payload.event === 'charge.success') {
      await applySuccessfulPayment(payload.data.reference, payload.data);
    } else if (payload.event?.startsWith('refund.')) {
      await applyRefundEvent(payload.data.transaction_reference, payload.data, payload.event);
    }
    receipt.status = 'processed';
    receipt.processedAt = new Date();
    await receipt.save();
    return res.sendStatus(200);
  } catch (err) {
    receipt.status = 'failed';
    receipt.error = err.message;
    await receipt.save();
    console.error('Paystack webhook processing failed', err);
    return res.sendStatus(500);
  }
}
