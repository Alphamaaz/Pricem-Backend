import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema({
  provider: { type: String, enum: ['paystack'], required: true, default: 'paystack' },
  eventKey: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
  reference: { type: String, trim: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
  processedAt: Date,
  error: { type: String, trim: true },
}, { timestamps: true });

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export default WebhookEvent;
