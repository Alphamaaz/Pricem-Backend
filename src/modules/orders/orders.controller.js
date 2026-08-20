import mongoose from 'mongoose';
import Order from './order.model.js';
import Cart from '../cart/cart.model.js';
import { createOrdersFromCart } from './orders.service.js';
import { closeOrderWorkspace, recordOrderSystemEvent } from '../chat/chat.service.js';
import { ensureEligiblePayout } from '../payouts/payouts.service.js';

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function canViewOrder(order, user) {
  return order.buyer.equals(user._id) || order.seller.equals(user._id) || user.roles.includes('admin');
}

function isSeller(order, user) {
  return order.seller.equals(user._id);
}

function isBuyer(order, user) {
  return order.buyer.equals(user._id);
}

function addTimeline(order, type, user, actorRole, message) {
  order.timeline.push({ type, actor: user?._id, actorRole, message });
}

async function loadOrder(id) {
  if (!validObjectId(id)) {
    const err = new Error('Invalid order id');
    err.status = 400;
    throw err;
  }
  const order = await Order.findById(id);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  return order;
}

// POST /api/v1/orders/checkout/cart
export async function checkoutCart(req, res, next) {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const orders = await createOrdersFromCart(cart, req.body.shippingAddress);
    res.status(201).json({ message: 'Order created from cart', orders });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders
export async function listOrders(req, res, next) {
  try {
    const { role, status, page, limit } = req.validatedQuery;
    const filter = {};

    if (role === 'buyer') filter.buyer = req.user._id;
    else if (role === 'seller') filter.seller = req.user._id;
    else if (!req.user.roles.includes('admin')) {
      filter.$or = [{ buyer: req.user._id }, { seller: req.user._id }];
    }

    if (status) filter.orderStatus = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);

    res.json({ orders, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/active-count
export async function getActiveOrderCount(req, res, next) {
  try {
    const count = await Order.countDocuments({
      $or: [{ buyer: req.user._id }, { seller: req.user._id }],
      orderStatus: { $nin: ['completed', 'cancelled'] },
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/orders/:id
export async function getOrderById(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid order id' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (!canViewOrder(order, req.user)) {
      return res.status(403).json({ message: 'You cannot view this order' });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:id/confirm-delivery
export async function confirmDelivery(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isBuyer(order, req.user)) {
      return res.status(403).json({ message: 'Only the buyer can confirm delivery' });
    }
    if (order.orderStatus !== 'delivered') {
      return res.status(409).json({ message: 'Delivery can only be confirmed after the order is marked delivered' });
    }

    order.orderStatus = 'completed';
    order.completedAt = new Date();
    addTimeline(order, 'buyer_confirmed', req.user, 'buyer', 'Buyer confirmed successful delivery.');
    addTimeline(order, 'completed', null, 'system', 'Order completed and seller payout is eligible for review.');
    const payout = await ensureEligiblePayout(order);
    addTimeline(order, 'payout_eligible', null, 'system', `Seller payout of NGN ${(payout.amountKobo / 100).toLocaleString()} is eligible for admin review.`);
    await order.save();
    await closeOrderWorkspace(order._id);
    await recordOrderSystemEvent(order._id, 'Buyer confirmed delivery. This order is complete and the workspace is now read-only.');

    res.json({ message: 'Delivery confirmed. The order workspace is now read-only.', order });
  } catch (err) {
    next(err);
  }
}


// PATCH /api/v1/orders/:id/delivery-arrangement
export async function proposeDeliveryArrangement(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isSeller(order, req.user)) {
      return res.status(403).json({ message: 'Only the seller can propose delivery arrangements' });
    }
    if (order.paymentStatus !== 'paid' || !['paid', 'processing'].includes(order.orderStatus)) {
      return res.status(409).json({ message: 'Delivery can only be arranged after item payment is confirmed' });
    }

    const isExternal = order.deliveryPolicy.mode === 'buyer_pays_externally';
    if (isExternal && req.body.externalCost === undefined) {
      return res.status(422).json({ message: 'Enter the delivery amount the buyer will pay externally' });
    }

    order.deliveryArrangement = {
      status: isExternal ? 'proposed' : 'acknowledged',
      courierName: req.body.courierName,
      externalCost: isExternal ? req.body.externalCost : undefined,
      notes: req.body.notes,
      proposedAt: new Date(),
      acknowledgedAt: isExternal ? undefined : new Date(),
    };
    const message = isExternal
      ? `Seller proposed external delivery with ${req.body.courierName}. Buyer acknowledgement is required.`
      : `Seller arranged included delivery with ${req.body.courierName}.`;
    addTimeline(order, 'delivery_proposed', req.user, 'seller', message);
    await order.save();
    await recordOrderSystemEvent(order._id, message);
    res.json({ message, order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:id/delivery-arrangement/acknowledge
export async function acknowledgeDeliveryArrangement(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isBuyer(order, req.user)) {
      return res.status(403).json({ message: 'Only the buyer can acknowledge this delivery arrangement' });
    }
    if (order.deliveryPolicy.mode !== 'buyer_pays_externally') {
      return res.status(409).json({ message: 'This order already includes seller-paid delivery' });
    }
    if (order.deliveryArrangement.status !== 'proposed') {
      return res.status(409).json({ message: 'There is no delivery proposal awaiting acknowledgement' });
    }

    order.deliveryArrangement.status = 'acknowledged';
    order.deliveryArrangement.acknowledgedAt = new Date();
    addTimeline(order, 'delivery_acknowledged', req.user, 'buyer', 'Buyer acknowledged the external delivery cost and arrangement.');
    await order.save();
    await recordOrderSystemEvent(order._id, 'Buyer acknowledged the external delivery arrangement. Pricem does not collect or protect this delivery payment.');
    res.json({ message: 'Delivery arrangement acknowledged', order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:id/processing
export async function startProcessing(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isSeller(order, req.user)) {
      return res.status(403).json({ message: 'Only the seller can start fulfilment' });
    }
    if (order.paymentStatus !== 'paid' || order.orderStatus !== 'paid') {
      return res.status(409).json({ message: 'The order must have confirmed payment before processing starts' });
    }

    order.orderStatus = 'processing';
    addTimeline(order, 'processing_started', req.user, 'seller', 'Seller started preparing the order.');
    await order.save();
    await recordOrderSystemEvent(order._id, 'Seller started preparing the order.');
    res.json({ message: 'Order marked as processing', order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:id/shipment
export async function markShipped(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isSeller(order, req.user)) {
      return res.status(403).json({ message: 'Only the seller can record shipment' });
    }
    if (order.orderStatus !== 'processing') {
      return res.status(409).json({ message: 'The order must be processing before it can be shipped' });
    }
    if (order.deliveryArrangement.status !== 'acknowledged') {
      return res.status(409).json({ message: 'The delivery arrangement must be acknowledged before shipment' });
    }

    order.shipment = {
      courierName: req.body.courierName,
      trackingNumber: req.body.trackingNumber,
      trackingUrl: req.body.trackingUrl,
      estimatedDeliveryAt: req.body.estimatedDeliveryAt,
      proofUrl: req.body.proofUrl,
      shippedAt: new Date(),
    };
    order.orderStatus = 'shipped';
    const trackingText = req.body.trackingNumber ? ` Tracking: ${req.body.trackingNumber}.` : '';
    const message = `Seller shipped the order with ${req.body.courierName}.${trackingText}`;
    addTimeline(order, 'shipped', req.user, 'seller', message);
    await order.save();
    await recordOrderSystemEvent(order._id, message);
    res.json({ message: 'Shipment recorded', order });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/orders/:id/mark-delivered
export async function markDelivered(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isSeller(order, req.user)) {
      return res.status(403).json({ message: 'Only the seller can mark the shipment delivered' });
    }
    if (order.orderStatus !== 'shipped') {
      return res.status(409).json({ message: 'Only a shipped order can be marked delivered' });
    }

    order.orderStatus = 'delivered';
    order.shipment.markedDeliveredAt = new Date();
    addTimeline(order, 'marked_delivered', req.user, 'seller', 'Seller marked the shipment delivered. Awaiting buyer confirmation.');
    await order.save();
    await recordOrderSystemEvent(order._id, 'Seller marked the shipment delivered. Buyer confirmation is now required.');
    res.json({ message: 'Order marked delivered', order });
  } catch (err) {
    next(err);
  }
}
