import mongoose from 'mongoose';
import Order from './order.model.js';
import Cart from '../cart/cart.model.js';
import { createOrdersFromCart } from './orders.service.js';

function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function canViewOrder(order, user) {
  return order.buyer.equals(user._id) || order.seller.equals(user._id) || user.roles.includes('admin');
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
