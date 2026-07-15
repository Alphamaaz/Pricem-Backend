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

const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: { type: String, enum: ['cart', 'offer'], required: true, index: true },
  offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', index: true },
  items: { type: [orderItemSchema], required: true },
  subtotal: { type: Number, required: true, min: 0 },
  deliveryTotal: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true, min: 0 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    index: true,
  },
  orderStatus: {
    type: String,
    enum: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending_payment',
    index: true,
  },
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
