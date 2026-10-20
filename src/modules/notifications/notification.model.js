import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        'chat',
        'offer_received',
        'offer_countered',
        'offer_accepted',
        'offer_rejected',
        'order_created',
        'order_processing',
        'order_shipped',
        'order_delivered',
        'order_completed',
        'order_cancelled',
        'system',
      ],
      default: 'system',
      index: true,
    },
    data: {
      type: Map,
      of: String,
      default: {},
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
