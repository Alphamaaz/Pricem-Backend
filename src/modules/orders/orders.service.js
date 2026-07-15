import Product from '../products/product.model.js';
import Order from './order.model.js';

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

async function decrementProductStock(product, selections = [], quantity = 1) {
  if ((product.variants || []).length === 0) {
    if (product.stock < quantity) return { error: `Only ${product.stock} item(s) available in stock` };
    product.stock -= quantity;
    if (product.stock === 0) product.status = 'sold';
    await product.save();
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
  await product.save();
  return {};
}

export async function createOrderFromOffer(offer, shippingAddress) {
  const existingOrder = await Order.findOne({ offer: offer._id });
  if (existingOrder) return existingOrder;

  const product = await Product.findOne({ _id: offer.product, status: 'active' });
  if (!product) {
    const err = new Error('Product not found or inactive');
    err.status = 404;
    throw err;
  }

  const stockResult = await decrementProductStock(product, offer.variantSelections, 1);
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

  const deliveryTotal = product.delivery?.cost ?? 0;

  return Order.create({
    buyer: offer.buyer,
    seller: offer.seller,
    source: 'offer',
    offer: offer._id,
    items: [item],
    subtotal: item.lineTotal,
    deliveryTotal,
    total: item.lineTotal + deliveryTotal,
    shippingAddress,
  });
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
    const productDeliveryCost = product.delivery?.cost ?? 0;
    deliveryBySeller.set(
      sellerDeliveryKey,
      Math.max(deliveryBySeller.get(sellerDeliveryKey) ?? 0, productDeliveryCost),
    );

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
    const deliveryTotal = deliveryBySeller.get(sellerId) ?? 0;
    orders.push(await Order.create({
      buyer: cart.user,
      seller: sellerId,
      source: 'cart',
      items,
      subtotal,
      deliveryTotal,
      total: subtotal + deliveryTotal,
      shippingAddress,
    }));
  }

  cart.items = [];
  await cart.save();

  return orders;
}
