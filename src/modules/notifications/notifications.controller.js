import Cart from '../cart/cart.model.js';
import Wishlist from '../wishlist/wishlist.model.js';
import Order from '../orders/order.model.js';
import Conversation from '../chat/conversation.model.js';
import Offer from '../offers/offer.model.js';
import Notification from './notification.model.js';
import { registerFcmToken, removeFcmToken, sendNotificationToUser } from './firebase.service.js';

export async function getNavigationSummary(req, res, next) {
  try {
    const [cart, wishlist, activeOrders, conversations, unreadBuyerOffers, unreadSellerOffers, unreadNotifications] = await Promise.all([
      Cart.findOne({ user: req.user._id }).select('items.quantity').lean(),
      Wishlist.findOne({ user: req.user._id }).select('items').lean(),
      Order.countDocuments({
        $or: [{ buyer: req.user._id }, { seller: req.user._id }],
        orderStatus: { $nin: ['completed', 'cancelled'] },
      }),
      Conversation.find({ $or: [{ buyer: req.user._id }, { seller: req.user._id }] })
        .select('buyer buyerUnreadCount sellerUnreadCount').lean(),
      Offer.countDocuments({ buyer: req.user._id, buyerUnread: true }),
      Offer.countDocuments({ seller: req.user._id, sellerUnread: true }),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);
    const unreadMessages = conversations.reduce((total, conversation) => (
      total + (String(conversation.buyer) === String(req.user._id)
        ? conversation.buyerUnreadCount || 0
        : conversation.sellerUnreadCount || 0)
    ), 0);
    res.set('Cache-Control', 'private, no-store');
    res.json({
      cart: cart?.items?.reduce((total, item) => total + item.quantity, 0) || 0,
      wishlist: wishlist?.items?.length || 0,
      orders: activeOrders,
      messages: unreadMessages,
      offers: unreadBuyerOffers + unreadSellerOffers,
      offersBuyer: unreadBuyerOffers,
      offersSeller: unreadSellerOffers,
      notifications: unreadNotifications,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/notifications/fcm-token
export async function registerFcm(req, res, next) {
  try {
    const { token, platform, deviceId } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Device FCM token is required' });
    }
    const tokens = await registerFcmToken(req.user._id, { token, platform, deviceId });
    res.json({ message: 'FCM device token registered successfully', tokensCount: tokens?.length || 0 });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/notifications/fcm-token
export async function unregisterFcm(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }
    await removeFcmToken(req.user._id, token);
    res.json({ message: 'FCM device token unregistered' });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/notifications
export async function listNotifications(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ user: req.user._id }),
      Notification.countDocuments({ user: req.user._id, isRead: false }),
    ]);

    res.json({
      notifications,
      total,
      unreadCount,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/notifications/:id/read
export async function markNotificationAsRead(req, res, next) {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ message: 'Notification marked as read', notification });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/notifications/read-all
export async function markAllNotificationsAsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/notifications/test
export async function testPushNotification(req, res, next) {
  try {
    const { title = 'PriceAm Test Notification', body = 'This is a test notification from PriceAm!', data = {} } = req.body;
    const result = await sendNotificationToUser(req.user._id, {
      title,
      body,
      type: 'system',
      data,
    });
    res.json({ message: 'Test notification triggered', notification: result });
  } catch (err) {
    next(err);
  }
}
