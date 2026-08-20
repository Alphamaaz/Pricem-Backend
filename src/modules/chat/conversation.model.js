import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', unique: true, sparse: true },
  scope: { type: String, enum: ['listing', 'order'], required: true, default: 'listing', index: true },
  status: { type: String, enum: ['open', 'closed', 'read_only'], default: 'open', index: true },
  lastMessagePreview: { type: String, trim: true, maxlength: 180, default: '' },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  messageCount: { type: Number, default: 0, min: 0 },
  buyerUnreadCount: { type: Number, default: 0, min: 0 },
  sellerUnreadCount: { type: Number, default: 0, min: 0 },
  buyerLastReadAt: Date,
  sellerLastReadAt: Date,
}, { timestamps: true });

// Only one open listing discussion can exist for the same buyer, seller, and item.
conversationSchema.index(
  { buyer: 1, seller: 1, product: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'listing' } },
);
conversationSchema.index({ buyer: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ seller: 1, status: 1, lastMessageAt: -1 });
conversationSchema.index({ buyer: 1, buyerUnreadCount: 1 });
conversationSchema.index({ seller: 1, sellerUnreadCount: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
