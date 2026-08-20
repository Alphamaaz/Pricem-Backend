import Cart from '../cart/cart.model.js';
import Wishlist from '../wishlist/wishlist.model.js';
import Order from '../orders/order.model.js';
import Conversation from '../chat/conversation.model.js';

export async function getNavigationSummary(req, res, next) {
  try {
    const [cart, wishlist, activeOrders, conversations] = await Promise.all([
      Cart.findOne({ user: req.user._id }).select('items.quantity').lean(),
      Wishlist.findOne({ user: req.user._id }).select('items').lean(),
      Order.countDocuments({
        $or: [{ buyer: req.user._id }, { seller: req.user._id }],
        orderStatus: { $nin: ['completed', 'cancelled'] },
      }),
      Conversation.find({ $or: [{ buyer: req.user._id }, { seller: req.user._id }] })
        .select('buyer buyerUnreadCount sellerUnreadCount').lean(),
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
    });
  } catch (err) {
    next(err);
  }
}
