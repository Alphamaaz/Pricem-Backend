import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  type: { type: String, enum: ['text', 'system', 'offer'], required: true, default: 'text' },
  text: { type: String, trim: true, maxlength: 1500 },
  event: {
    action: { type: String, trim: true },
    offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
    price: { type: Number, min: 0 },
  },
}, { timestamps: true });

// Cursor pagination uses conversation + _id without scanning a user's full history.
messageSchema.index({ conversation: 1, _id: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
