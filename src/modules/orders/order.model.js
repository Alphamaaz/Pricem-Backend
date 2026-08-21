import mongoose from 'mongoose';

const orderVariantSelectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  storeName: { type: String, required: true, trim: true },
  storeSlug: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  coverImage: {
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
  },
  variantSelections: { type: [orderVariantSelectionSchema], default: [] },
  variantKey: { type: String, default: '', trim: true },
  originalPrice: { type: Number, required: true, min: 0 },
  finalPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const orderTimelineSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'order_created',
      'payment_confirmed',
      'delivery_proposed',
      'delivery_acknowledged',
      'processing_started',
      'shipped',
      'marked_delivered',
      'buyer_confirmed',
      'dispute_opened',
      'dispute_resolved',
      'payout_eligible',
      'payout_approved',
      'payout_paid',
      'completed',
      'cancelled',
    ],
    required: true,
  },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, enum: ['buyer', 'seller', 'admin', 'system'], required: true },
  message: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now, immutable: true },
}, { _id: true });

const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['cart', 'offer'], required: true, index: true },
  offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', index: true, unique: true, sparse: true },
  items: { type: [orderItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  deliveryTotal: { type: Number, required: true, min: 0, default: 0 },
  deliveryPolicy: {
    mode: {
      type: String,
      enum: ['seller_included', 'buyer_pays_externally'],
      required: true,
      default: 'buyer_pays_externally',
    },
    estimatedDays: { type: String, trim: true },
    details: { type: String, trim: true },
    externalPaymentNotice: { type: Boolean, default: false },
  },
  deliveryArrangement: {
    status: {
      type: String,
      enum: ['pending', 'proposed', 'acknowledged'],
      default: 'pending',
      index: true,
    },
    courierName: { type: String, trim: true, maxlength: 120 },
    externalCost: { type: Number, min: 0 },
    notes: { type: String, trim: true, maxlength: 1000 },
    proposedAt: Date,
    acknowledgedAt: Date,
  },
  shipment: {
    courierName: { type: String, trim: true, maxlength: 120 },
    trackingNumber: { type: String, trim: true, maxlength: 200 },
    trackingUrl: { type: String, trim: true, maxlength: 1000 },
    estimatedDeliveryAt: Date,
    proofUrl: { type: String, trim: true, maxlength: 1000 },
    shippedAt: Date,
    markedDeliveredAt: Date,
  },
  total: { type: Number, required: true, min: 0 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'partially_refunded', 'refunded'],
    default: 'pending',
    index: true,
  },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true },
  paymentReference: { type: String, trim: true, index: true },
  paidAt: Date,
  financials: {
    grossAmountKobo: { type: Number, min: 0, default: 0 },
    platformFeeKobo: { type: Number, min: 0, default: 0 },
    processorFeeKobo: { type: Number, min: 0, default: 0 },
    sellerPayableKobo: { type: Number, min: 0, default: 0 },
    refundedAmountKobo: { type: Number, min: 0, default: 0 },
  },
  orderStatus: {
    type: String,
    enum: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'],
    default: 'pending_payment',
    index: true,
  },
  inventoryReservation: {
    status: { type: String, enum: ['none', 'reserved', 'committed', 'released'], default: 'none', index: true },
    expiresAt: { type: Date, index: true },
    committedAt: Date,
    releasedAt: Date,
  },
  completedAt: Date,
  disputeStatus: {
    type: String,
    enum: ['none', 'open', 'under_review', 'resolved'],
    default: 'none',
    index: true,
  },
  activeDispute: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', index: true },
  payoutStatus: {
    type: String,
    enum: ['not_eligible', 'eligible', 'held', 'approved', 'paid', 'cancelled'],
    default: 'not_eligible',
    index: true,
  },
  payout: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerPayout', index: true },
  timeline: { type: [orderTimelineSchema], default: [] },
  shippingAddress: {
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, trim: true },
  },
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);
export default Order;
