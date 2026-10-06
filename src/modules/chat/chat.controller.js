import Product from '../products/product.model.js';
import Conversation from './conversation.model.js';
import Message from './message.model.js';
import { findBlockedContent } from './content-filter.service.js';
import {
  getOrCreateListingConversation,
  isConversationParticipant,
  validObjectId,
} from './chat.service.js';
import { emitToUser } from '../../config/socket.js';

async function findParticipantConversation(id, userId) {
  const conversation = await Conversation.findById(id);
  if (!conversation) return { error: 'Conversation not found', status: 404 };
  if (!isConversationParticipant(conversation, userId)) {
    return { error: 'You cannot access this conversation', status: 403 };
  }
  return { conversation };
}

// POST /api/v1/chat/products/:productId/conversation
export async function openListingConversation(req, res, next) {
  try {
    if (!validObjectId(req.params.productId)) {
      return res.status(400).json({ message: 'Invalid product id' });
    }

    const product = await Product.findOne({ _id: req.params.productId, status: 'active' }).select('seller');
    if (!product) return res.status(404).json({ message: 'Product not found or inactive' });
    if (product.seller.equals(req.user._id)) {
      return res.status(403).json({ message: 'You cannot start a conversation about your own product' });
    }

    const conversation = await getOrCreateListingConversation({
      buyer: req.user._id,
      seller: product.seller,
      product: product._id,
    });

    if (conversation.status !== 'open') {
      return res.status(409).json({ message: 'This listing conversation is no longer available' });
    }

    res.status(201).json({ message: 'Listing conversation opened', conversation });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/conversations
export async function listConversations(req, res, next) {
  try {
    const { scope, status, page, limit } = req.validatedQuery;
    const filter = { $or: [{ buyer: req.user._id }, { seller: req.user._id }] };
    if (scope) filter.scope = scope;
    if (status) filter.status = status;
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate('product', 'title coverImage status')
        .populate('order', 'orderStatus paymentStatus total')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit),
      Conversation.countDocuments(filter),
    ]);

    const response = conversations.map((conversation) => {
      const item = conversation.toObject();
      item.unreadCount = conversation.buyer.equals(req.user._id)
        ? conversation.buyerUnreadCount
        : conversation.sellerUnreadCount;
      delete item.buyerUnreadCount;
      delete item.sellerUnreadCount;
      return item;
    });
    res.json({ conversations: response, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/conversations/unread-count
export async function getUnreadConversationCount(req, res, next) {
  try {
    const conversations = await Conversation.find({
      $or: [{ buyer: req.user._id }, { seller: req.user._id }],
    }).select('buyer buyerUnreadCount sellerUnreadCount');
    const count = conversations.reduce((total, conversation) => (
      total + (conversation.buyer.equals(req.user._id)
        ? conversation.buyerUnreadCount
        : conversation.sellerUnreadCount)
    ), 0);
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/conversations/:id
export async function getConversation(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid conversation id' });
    const result = await findParticipantConversation(req.params.id, req.user._id);
    if (result.error) return res.status(result.status).json({ message: result.error });
    res.json({ conversation: result.conversation });
  } catch (err) {
    next(err);
  }
}

export async function markConversationRead(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid conversation id' });
    const result = await findParticipantConversation(req.params.id, req.user._id);
    if (result.error) return res.status(result.status).json({ message: result.error });
    const isBuyer = result.conversation.buyer.equals(req.user._id);
    await Conversation.updateOne(
      { _id: result.conversation._id },
      { $set: isBuyer
        ? { buyerUnreadCount: 0, buyerLastReadAt: new Date() }
        : { sellerUnreadCount: 0, sellerLastReadAt: new Date() } },
    );
    emitToUser(req.user._id, 'badges:changed', { reason: 'messages-read' });
    res.json({ message: 'Conversation marked as read' });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/orders/:orderId/conversation
export async function getOrderConversation(req, res, next) {
  try {
    if (!validObjectId(req.params.orderId)) return res.status(400).json({ message: 'Invalid order id' });
    const conversation = await Conversation.findOne({ order: req.params.orderId });
    if (!conversation) return res.status(404).json({ message: 'Order workspace not found' });
    if (!isConversationParticipant(conversation, req.user._id)) {
      return res.status(403).json({ message: 'You cannot access this order workspace' });
    }
    res.json({ conversation });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/conversations/:id/messages?before=:messageId&limit=30
export async function listMessages(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid conversation id' });
    const result = await findParticipantConversation(req.params.id, req.user._id);
    if (result.error) return res.status(result.status).json({ message: result.error });

    const { before, limit } = req.validatedQuery;
    if (before && !validObjectId(before)) return res.status(400).json({ message: 'Invalid message cursor' });
    const filter = { conversation: result.conversation._id };
    if (before) filter._id = { $lt: before };

    const records = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    const messages = page.reverse();

    const isBuyer = result.conversation.buyer.equals(req.user._id);
    await Conversation.updateOne(
      { _id: result.conversation._id },
      { $set: isBuyer
        ? { buyerUnreadCount: 0, buyerLastReadAt: new Date() }
        : { sellerUnreadCount: 0, sellerLastReadAt: new Date() } },
    );
    emitToUser(req.user._id, 'badges:changed', { reason: 'messages-read' });

    res.json({
      messages,
      nextCursor: hasMore ? String(page[0]._id) : null,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/chat/conversations/:id/messages
export async function sendMessage(req, res, next) {
  try {
    if (!validObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid conversation id' });
    const result = await findParticipantConversation(req.params.id, req.user._id);
    if (result.error) return res.status(result.status).json({ message: result.error });
    if (result.conversation.status !== 'open') {
      return res.status(409).json({ message: 'This conversation is read-only or closed' });
    }

    const isOrderWorkspace = result.conversation.scope === 'order';
    const blockedReason = findBlockedContent(req.body.text, { isOrderWorkspace });
    if (blockedReason) {
      return res.status(422).json({
        message: `Message not sent. PriceAm does not allow ${blockedReason} in chat.`,
      });
    }

    const message = await Message.create({
      conversation: result.conversation._id,
      sender: req.user._id,
      type: 'text',
      text: req.body.text,
    });

    const senderIsBuyer = result.conversation.buyer.equals(req.user._id);
    await Conversation.updateOne(
      { _id: result.conversation._id, status: 'open' },
      {
        $set: { lastMessageAt: message.createdAt, lastMessagePreview: message.text.slice(0, 180) },
        $inc: {
          messageCount: 1,
          ...(senderIsBuyer ? { sellerUnreadCount: 1 } : { buyerUnreadCount: 1 }),
        },
      },
    );

    const recipientId = senderIsBuyer ? result.conversation.seller : result.conversation.buyer;
    const realtimePayload = { conversationId: String(result.conversation._id), message };
    emitToUser(recipientId, 'message:new', realtimePayload);
    emitToUser(recipientId, 'badges:changed', { reason: 'new-message' });
    emitToUser(recipientId, 'conversation:changed', { conversationId: String(result.conversation._id) });
    emitToUser(req.user._id, 'conversation:changed', { conversationId: String(result.conversation._id) });

    res.status(201).json({ message: 'Message sent', chatMessage: message });
  } catch (err) {
    next(err);
  }
}
