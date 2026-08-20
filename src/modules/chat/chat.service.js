import mongoose from 'mongoose';
import Conversation from './conversation.model.js';
import Message from './message.model.js';

export function validObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

export function isConversationParticipant(conversation, userId) {
  return conversation.buyer.equals(userId) || conversation.seller.equals(userId);
}

export async function getOrCreateListingConversation({ buyer, seller, product }) {
  return Conversation.findOneAndUpdate(
    { buyer, seller, product, scope: 'listing' },
    {
      $setOnInsert: {
        buyer,
        seller,
        product,
        scope: 'listing',
        status: 'open',
        lastMessageAt: new Date(),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

export async function recordOfferEvent({ offer, action }) {
  const conversation = offer.conversation
    ? await Conversation.findById(offer.conversation)
    : await getOrCreateListingConversation({
      buyer: offer.buyer,
      seller: offer.seller,
      product: offer.product,
    });

  if (!conversation) return null;

  if (!offer.conversation) {
    offer.conversation = conversation._id;
    await offer.save();
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: null,
    type: 'offer',
    event: { action, offer: offer._id, price: offer.currentPrice },
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessageAt: message.createdAt, lastMessagePreview: 'Offer updated' }, $inc: { messageCount: 1 } },
  );

  return conversation;
}

export async function ensureOrderWorkspaceForOrder(order) {
  const existing = await Conversation.findOne({ order: order._id });
  if (existing) return existing;

  const productIds = order.items.map((item) => item.product);
  const listingConversation = await Conversation.findOne({
    buyer: order.buyer,
    seller: order.seller,
    product: { $in: productIds },
    scope: 'listing',
  }).sort({ lastMessageAt: -1 });

  if (listingConversation) {
    const transitioned = await Conversation.findOneAndUpdate(
      { _id: listingConversation._id, scope: 'listing', order: { $exists: false } },
      { $set: { scope: 'order', order: order._id, status: 'open', lastMessageAt: new Date() } },
      { new: true },
    );
    if (transitioned) {
      await Message.create({
        conversation: transitioned._id,
        type: 'system',
        text: 'Order created. Use this workspace for delivery coordination only.',
      });
      await Conversation.updateOne(
        { _id: transitioned._id },
        { $set: { lastMessagePreview: 'Order created', lastMessageAt: new Date() }, $inc: { messageCount: 1 } },
      );
      return transitioned;
    }
  }

  const workspace = await Conversation.create({
    buyer: order.buyer,
    seller: order.seller,
    product: order.items[0].product,
    order: order._id,
    scope: 'order',
    status: 'open',
    lastMessagePreview: 'Order created',
  });
  await Message.create({
    conversation: workspace._id,
    type: 'system',
    text: 'Order created. Use this workspace for delivery coordination only.',
  });
  await Conversation.updateOne({ _id: workspace._id }, { $inc: { messageCount: 1 } });
  return workspace;
}

export async function closeOrderWorkspace(orderId) {
  return Conversation.updateOne(
    { order: orderId },
    { $set: { status: 'read_only' } },
  );
}

export async function reopenOrderWorkspace(orderId) {
  return Conversation.updateOne(
    { order: orderId },
    { $set: { status: 'open' } },
  );
}

export async function recordOrderSystemEvent(orderId, text) {
  const conversation = await Conversation.findOne({ order: orderId });
  if (!conversation) return null;

  const message = await Message.create({
    conversation: conversation._id,
    type: 'system',
    text,
  });
  await Conversation.updateOne(
    { _id: conversation._id },
    { $set: { lastMessagePreview: text.slice(0, 180), lastMessageAt: message.createdAt }, $inc: { messageCount: 1 } },
  );
  return message;
}
