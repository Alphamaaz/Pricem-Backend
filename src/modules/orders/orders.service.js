import Product from '../products/product.model.js';
import Order from './order.model.js';
import { ensureOrderWorkspaceForOrder } from '../chat/chat.service.js';
import Offer from '../offers/offer.model.js';

function variantMatches(option, selection) {
  return option.value === selection.value;
}

function getSelectedVariantDetails(product, selections = []) {
  const variants = product.variants || [];

  if (variants.length === 0) {
    return {
      availableStock: product.stock,
      listedPrice: product.price,
    };
  }

  const selectedOptions = [];

  for (const variant of variants) {
    const selection = selections.find((item) => item.name === variant.name);
    if (!selection) {
      return { error: `Missing selection for variant '${variant.name}'` };
    }

    const option = variant.options.find((item) => variantMatches(item, selection));
    if (!option) {
      return { error: `Invalid option '${selection.value}' for variant '${variant.name}'` };
    }

    selectedOptions.push(option);
  }

  return {
    availableStock: Math.min(...selectedOptions.map((option) => option.stock)),
    listedPrice: Math.max(...selectedOptions.map((option) => option.price)),
  };
}

async function decrementProductStock(product, selections = [], quantity = 1, session) {
  if ((product.variants || []).length === 0) {
    if (product.stock < quantity) return { error: `Only ${product.stock} item(s) available in stock` };
    product.stock -= quantity;
    if (product.stock === 0) product.status = 'sold';
    await product.save({ session });
    return {};
  }

  const details = getSelectedVariantDetails(product, selections);
  if (details.error) return details;
  if (details.availableStock < quantity) {
    return { error: `Only ${details.availableStock} item(s) available in stock for this selection` };
  }

  for (const variant of product.variants) {
    const selection = selections.find((item) => item.name === variant.name);
    const option = variant.options.find((item) => item.value === selection.value);
    option.stock -= quantity;
  }

  product.stock = Math.max(0, product.stock - quantity);
  if (product.stock === 0) product.status = 'sold';
  await product.save({ session });
  return {};
}

async function restoreProductStock(product, selections = [], quantity = 1, session) {
  if ((product.variants || []).length === 0) {
    product.stock += quantity;
  } else {
    for (const variant of product.variants) {
      const selection = selections.find((item) => item.name === variant.name);
      const option = variant.options.find((item) => item.value === selection?.value);
      if (option) option.stock += quantity;
    }
    product.stock += quantity;
  }
  if (product.status === 'sold' && product.stock > 0) product.status = 'active';
  await product.save({ session });
}

export async function createOrderFromOffer(offer, shippingAddress, { session } = {}) {
  const existingOrder = await Order.findOne({ offer: offer._id }).session(session || null);
  if (existingOrder) return existingOrder;

  const product = await Product.findOne({ _id: offer.product, status: 'active' }).session(session || null);
  if (!product) {
    const err = new Error('Product not found or inactive');
    err.status = 404;
    throw err;
  }

  const stockResult = await decrementProductStock(product, offer.variantSelections, 1, session);
  if (stockResult.error) {
    const err = new Error(stockResult.error);
    err.status = 422;
    throw err;
  }

  const item = {
    product: product._id,
    seller: offer.seller,
    storeName: offer.storeName,
    storeSlug: offer.storeSlug,
    title: offer.productTitle,
    coverImage: offer.coverImage,
    variantSelections: offer.variantSelections,
    variantKey: offer.variantKey,
    originalPrice: offer.listedPrice,
    finalPrice: offer.currentPrice,
    quantity: 1,
    lineTotal: offer.currentPrice,
  };

  const deliveryMode = product.delivery?.mode ?? 'buyer_pays_externally';

  const reservationHours = Math.max(1, Number(process.env.OFFER_PAYMENT_WINDOW_HOURS) || 24);
  const orderData = {
    buyer: offer.buyer,
    seller: offer.seller,
    source: 'offer',
    offer: offer._id,
    items: [item],
    subtotal: item.lineTotal,
    deliveryTotal: 0,
    total: item.lineTotal,
    deliveryPolicy: {
      mode: deliveryMode,
      estimatedDays: product.delivery?.estimatedDays,
      details: product.delivery?.details,
      externalPaymentNotice: deliveryMode === 'buyer_pays_externally',
    },
    timeline: [{ type: 'order_created', actorRole: 'system', message: 'Order created from accepted offer.' }],
    shippingAddress,
    inventoryReservation: {
      status: 'reserved',
      expiresAt: new Date(Date.now() + reservationHours * 60 * 60 * 1000),
    },
  };
  const order = session
    ? (await Order.create([orderData], { session }))[0]
    : await Order.create(orderData);
  if (!session) await ensureOrderWorkspaceForOrder(order);
  return order;
}

export async function releaseExpiredOfferReservations(now = new Date()) {
  const candidates = await Order.find({
    source: 'offer',
    orderStatus: 'pending_payment',
    paymentStatus: 'pending',
    'inventoryReservation.status': 'reserved',
    'inventoryReservation.expiresAt': { $lte: now },
  }).select('_id');

  let released = 0;
  for (const candidate of candidates) {
    const session = await Order.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({
          _id: candidate._id,
          orderStatus: 'pending_payment',
          paymentStatus: 'pending',
          'inventoryReservation.status': 'reserved',
          'inventoryReservation.expiresAt': { $lte: now },
        }).session(session);
        if (!order) return;
        for (const item of order.items) {
          const product = await Product.findById(item.product).session(session);
          if (product) await restoreProductStock(product, item.variantSelections, item.quantity, session);
        }
        order.inventoryReservation.status = 'released';
        order.inventoryReservation.releasedAt = now;
        order.orderStatus = 'cancelled';
        order.timeline.push({ type: 'cancelled', actorRole: 'system', message: 'Order cancelled because the accepted offer was not paid before its reservation expired.' });
        await order.save({ session });
        await Offer.updateOne(
          { _id: order.offer, status: 'accepted' },
          {
            $set: { status: 'expired', expiredAt: now },
            $push: { history: { action: 'expired', proposedBy: 'buyer', user: order.buyer, price: order.total, createdAt: now } },
          },
          { session },
        );
        released += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  return released;
}

export async function createOrdersFromCart(cart, shippingAddress) {
  if (!cart.items.length) {
    const err = new Error('Cart is empty');
    err.status = 400;
    throw err;
  }

  const ordersBySeller = new Map();
  const deliveryBySeller = new Map();

  for (const cartItem of cart.items) {
    const product = await Product.findOne({ _id: cartItem.product, status: 'active' });
    if (!product) {
      const err = new Error(`Product '${cartItem.title}' is no longer available`);
      err.status = 422;
      throw err;
    }

    const stockResult = await decrementProductStock(product, cartItem.variantSelections, cartItem.quantity);
    if (stockResult.error) {
      const err = new Error(`${cartItem.title}: ${stockResult.error}`);
      err.status = 422;
      throw err;
    }

    // One delivery fee per seller shipment — the highest cost among their items
    const sellerDeliveryKey = String(cartItem.seller);
    const deliveryMode = product.delivery?.mode ?? 'buyer_pays_externally';
    const currentPolicy = deliveryBySeller.get(sellerDeliveryKey);
    deliveryBySeller.set(sellerDeliveryKey, {
      mode: currentPolicy?.mode === 'buyer_pays_externally' || deliveryMode === 'buyer_pays_externally'
        ? 'buyer_pays_externally'
        : 'seller_included',
      estimatedDays: currentPolicy?.estimatedDays || product.delivery?.estimatedDays,
      details: currentPolicy?.details || product.delivery?.details,
    });

    const item = {
      product: cartItem.product,
      seller: cartItem.seller,
      storeName: cartItem.storeName,
      storeSlug: cartItem.storeSlug,
      title: cartItem.title,
      coverImage: cartItem.coverImage,
      variantSelections: cartItem.variantSelections,
      variantKey: cartItem.variantKey,
      originalPrice: cartItem.priceSnapshot,
      finalPrice: cartItem.priceSnapshot,
      quantity: cartItem.quantity,
      lineTotal: cartItem.priceSnapshot * cartItem.quantity,
    };

    const sellerKey = String(cartItem.seller);
    if (!ordersBySeller.has(sellerKey)) ordersBySeller.set(sellerKey, []);
    ordersBySeller.get(sellerKey).push(item);
  }

  const orders = [];
  for (const [sellerId, items] of ordersBySeller.entries()) {
    const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
    const deliveryPolicy = deliveryBySeller.get(sellerId) ?? { mode: 'buyer_pays_externally' };
    const order = await Order.create({
      buyer: cart.user,
      seller: sellerId,
      source: 'cart',
      items,
      subtotal,
      deliveryTotal: 0,
      total: subtotal,
      deliveryPolicy: {
        ...deliveryPolicy,
        externalPaymentNotice: deliveryPolicy.mode === 'buyer_pays_externally',
      },
      timeline: [{ type: 'order_created', actorRole: 'system', message: 'Order created from cart checkout.' }],
      shippingAddress,
    });
    await ensureOrderWorkspaceForOrder(order);
    orders.push(order);
  }

  cart.items = [];
  await cart.save();

  return orders;
}
