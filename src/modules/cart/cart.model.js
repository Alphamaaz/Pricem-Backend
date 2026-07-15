import mongoose from 'mongoose';

const cartVariantSelectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
}, { _id: false });

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  storeName: { type: String, required: true, trim: true },
  storeSlug: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  coverImage: {
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
  },
  variantSelections: { type: [cartVariantSelectionSchema], default: [] },
  variantKey: { type: String, default: '', trim: true },
  priceSnapshot: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 },
}, { timestamps: true });

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  items: { type: [cartItemSchema], default: [] },
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
