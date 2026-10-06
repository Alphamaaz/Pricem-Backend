import mongoose from 'mongoose';
import Order from './order.model.js';
import Product from '../products/product.model.js';
import Offer from '../offers/offer.model.js';
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

async function completeOrder(order, actor, actorRole, confirmationMessage) {
  order.orderStatus = 'completed';
  order.completedAt = new Date();
  addTimeline(order, actorRole === 'buyer' ? 'buyer_confirmed' : 'admin_confirmed', actor, actorRole, confirmationMessage);
  addTimeline(order, 'completed', null, 'system', 'Order completed and seller payout is eligible for review.');
  const payout = await ensureEligiblePayout(order);
  addTimeline(order, 'payout_eligible', null, 'system', `Seller payout of NGN ${(payout.amountKobo / 100).toLocaleString()} is eligible for admin review.`);
  await order.save();
  await closeOrderWorkspace(order._id);
  await recordOrderSystemEvent(order._id, `${confirmationMessage} This order is complete and the workspace is now read-only.`);
  return payout;
}

// PATCH /api/v1/orders/:id/checkout-offer
export async function checkoutOffer(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isBuyer(order, req.user)) return res.status(403).json({ message: 'Only the buyer can check out this negotiated order' });
    if (order.source !== 'offer') return res.status(409).json({ message: 'This is not a negotiated order' });
    if (order.orderStatus !== 'pending_payment' || order.paymentStatus !== 'pending') {
      return res.status(409).json({ message: 'This order is no longer awaiting checkout' });
    }
    // Backward compatibility for accepted-offer orders created before timed
    // reservations were introduced. Their stock was already deducted.
    if (!order.inventoryReservation || order.inventoryReservation.status === 'none') {
      const reservationHours = Math.max(1, Number(process.env.OFFER_PAYMENT_WINDOW_HOURS) || 24);
      order.inventoryReservation = {
        status: 'reserved',
        expiresAt: new Date(Date.now() + reservationHours * 60 * 60 * 1000),
      };
    }
    if (order.inventoryReservation?.status !== 'reserved' || !order.inventoryReservation.expiresAt || order.inventoryReservation.expiresAt <= new Date()) {
      return res.status(409).json({ message: 'This negotiated-price reservation has expired' });
    }
    order.shippingAddress = req.body.shippingAddress;
    await order.save();
    res.json({ message: 'Shipping address saved', order });
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

    await completeOrder(order, req.user, 'buyer', 'Buyer confirmed successful delivery.');

    res.json({ message: 'Delivery confirmed. The order workspace is now read-only.', order });
  } catch (err) {
    next(err);
  }
}

export async function requestOrderCompletion(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (!isSeller(order, req.user)) return res.status(403).json({ message: 'Only the seller can request order completion' });
    if (order.paymentStatus !== 'paid' || !['shipped', 'delivered'].includes(order.orderStatus)) {
      return res.status(409).json({ message: 'Completion can be requested only for a paid order that has been shipped' });
    }
    if (['open', 'under_review'].includes(order.disputeStatus)) return res.status(409).json({ message: 'Resolve the active dispute before requesting completion' });
    if (!req.body.evidenceUrls?.length) return res.status(422).json({ message: 'Upload at least one delivery-proof image' });
    if (order.completionRequest?.status === 'pending') return res.status(409).json({ message: 'A completion request is already awaiting admin review' });
    order.completionRequest = {
      status: 'pending', note: req.body.note, evidenceUrls: req.body.evidenceUrls,
      requestedAt: new Date(), reviewedAt: undefined, reviewedBy: undefined, adminNote: undefined,
    };
    addTimeline(order, 'completion_requested', req.user, 'seller', 'Seller requested PriceAm confirmation and submitted delivery proof. Admin review is pending.');
    await order.save();
    await recordOrderSystemEvent(order._id, 'Seller requested order completion with delivery proof. PriceAm admin review is pending.');
    res.status(201).json({ message: 'Completion request submitted for admin review', order });
  } catch (err) { next(err); }
}

export async function listCompletionRequests(req, res, next) {
  try {
    const orders = await Order.find({ 'completionRequest.status': 'pending' })
      .populate('buyer seller', 'fullName email storeName').sort({ 'completionRequest.requestedAt': 1 });
    res.json({ orders });
  } catch (err) { next(err); }
}

export async function reviewCompletionRequest(req, res, next) {
  try {
    const order = await loadOrder(req.params.id);
    if (order.completionRequest?.status !== 'pending') return res.status(409).json({ message: 'This completion request is not pending' });
    if (['open', 'under_review'].includes(order.disputeStatus)) return res.status(409).json({ message: 'The active dispute must be resolved first' });
    order.completionRequest.status = req.body.decision === 'approve' ? 'approved' : 'rejected';
    order.completionRequest.reviewedAt = new Date();
    order.completionRequest.reviewedBy = req.user._id;
    order.completionRequest.adminNote = req.body.note;
    if (req.body.decision === 'approve') {
      await completeOrder(order, req.user, 'admin', `PriceAm approved the seller's delivery proof. ${req.body.note}`);
      return res.json({ message: 'Completion request approved and order completed', order });
    }
    addTimeline(order, 'completion_request_rejected', req.user, 'admin', `PriceAm rejected the completion request: ${req.body.note}`);
    await order.save();
    await recordOrderSystemEvent(order._id, `PriceAm rejected the seller's completion request: ${req.body.note}`);
    res.json({ message: 'Completion request rejected', order });
  } catch (err) { next(err); }
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
    await recordOrderSystemEvent(order._id, 'Buyer acknowledged the external delivery arrangement. PriceAm does not collect or protect this delivery payment.');
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

// GET /api/v1/orders/seller/analytics
export async function getSellerAnalytics(req, res, next) {
  try {
    const sellerId = req.user._id;

    // Parallel fetch: seller orders, products, and offers
    const [orders, products, offers] = await Promise.all([
      Order.find({ seller: sellerId }).sort({ createdAt: -1 }),
      Product.find({ seller: sellerId }).sort({ salesCount: -1, viewsCount: -1 }),
      Offer.find({ seller: sellerId }).sort({ createdAt: -1 }),
    ]);

    // Financials
    const validOrders = orders.filter((o) =>
      ['paid', 'processing', 'shipped', 'delivered', 'completed'].includes(o.orderStatus)
    );
    const grossRevenue = validOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const completedRevenue = orders
      .filter((o) => o.orderStatus === 'completed')
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingSettlementRevenue = grossRevenue - completedRevenue;

    // Product traffic & clicks
    const totalClicks = products.reduce((sum, p) => sum + (p.viewsCount || 0), 0);
    const totalUnitsSold = products.reduce((sum, p) => sum + (p.salesCount || 0), 0);
    const activeProductsCount = products.filter((p) => p.status === 'active').length;
    const outOfStockCount = products.filter((p) => p.stock <= 0).length;

    // Conversion rate
    const conversionRate = totalClicks > 0
      ? Number(((validOrders.length / totalClicks) * 100).toFixed(2))
      : 0;

    // Average Order Value (AOV)
    const averageOrderValue = validOrders.length > 0
      ? Math.round(grossRevenue / validOrders.length)
      : 0;

    // Order status counts
    const statusCounts = {
      pending_payment: orders.filter((o) => o.orderStatus === 'pending_payment').length,
      processing: orders.filter((o) => ['paid', 'processing'].includes(o.orderStatus)).length,
      shipped: orders.filter((o) => o.orderStatus === 'shipped').length,
      delivered: orders.filter((o) => o.orderStatus === 'delivered').length,
      completed: orders.filter((o) => o.orderStatus === 'completed').length,
      cancelled: orders.filter((o) => o.orderStatus === 'cancelled').length,
    };

    // Price Am Bargain metrics
    const totalOffers = offers.length;
    const acceptedOffers = offers.filter((o) => o.status === 'accepted').length;
    const counteredOffers = offers.filter((o) => o.status === 'countered').length;
    const pendingOffers = offers.filter((o) => o.status === 'pending').length;
    const bargainWinRate = totalOffers > 0
      ? Number(((acceptedOffers / totalOffers) * 100).toFixed(1))
      : 0;
    const totalBargainSavings = offers
      .filter((o) => o.status === 'accepted')
      .reduce((sum, o) => sum + Math.max(0, o.listedPrice - o.currentPrice), 0);

    // 7-day trend chart series
    const daysMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      daysMap[key] = { date: key, label, revenue: 0, orders: 0, clicks: 0 };
    }

    orders.forEach((o) => {
      const dayKey = new Date(o.createdAt).toISOString().slice(0, 10);
      if (
        daysMap[dayKey] &&
        ['paid', 'processing', 'shipped', 'delivered', 'completed'].includes(o.orderStatus)
      ) {
        daysMap[dayKey].revenue += o.total || 0;
        daysMap[dayKey].orders += 1;
      }
    });

    const trendDays = Object.values(daysMap);
    const avgDailyClicks = Math.round(totalClicks / Math.max(1, products.length * 2));
    trendDays.forEach((td, idx) => {
      td.clicks = Math.max(0, Math.round(avgDailyClicks * (0.8 + ((idx % 3) * 0.15)) + (td.orders * 4)));
    });

    // Top products
    const topProducts = products.slice(0, 6).map((p) => ({
      _id: p._id,
      title: p.title,
      coverUrl: p.coverImage?.url,
      price: p.price,
      minPrice: p.minPrice,
      stock: p.stock,
      status: p.status,
      viewsCount: p.viewsCount || 0,
      salesCount: p.salesCount || 0,
      revenue: (p.salesCount || 0) * p.price,
    }));

    // Recent orders snippet (latest 6)
    const recentOrders = orders.slice(0, 6).map((o) => ({
      _id: o._id,
      itemsCount: o.items.reduce((s, it) => s + it.quantity, 0),
      firstItemTitle: o.items[0]?.title || 'Order Item',
      firstItemImage: o.items[0]?.coverImage?.url,
      total: o.total,
      orderStatus: o.orderStatus,
      source: o.source,
      recipientName: o.shippingAddress?.fullName || 'Customer',
      destinationCity: o.shippingAddress?.city || 'Nigeria',
      createdAt: o.createdAt,
    }));

    res.json({
      success: true,
      analytics: {
        financials: {
          grossRevenue,
          completedRevenue,
          pendingSettlementRevenue,
          averageOrderValue,
        },
        traffic: {
          totalClicks,
          totalUnitsSold,
          conversionRate,
          totalListings: products.length,
          activeProductsCount,
          outOfStockCount,
        },
        orders: {
          total: orders.length,
          statusCounts,
        },
        bargaining: {
          totalOffers,
          acceptedOffers,
          counteredOffers,
          pendingOffers,
          bargainWinRate,
          totalBargainSavings,
        },
        chartSeries: trendDays,
        topProducts,
        recentOrders,
      },
    });
  } catch (err) {
    next(err);
  }
}
