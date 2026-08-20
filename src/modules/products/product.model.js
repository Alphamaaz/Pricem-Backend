import mongoose from 'mongoose';

const productImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, trim: true },
  alt: { type: String, trim: true },
}, { _id: false });

const productMediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video'], required: true },
  url: { type: String, required: true, trim: true },
  publicId: { type: String, trim: true },
  alt: { type: String, trim: true },
  mimeType: { type: String, required: true, trim: true },
  sizeBytes: { type: Number, required: true, min: 0, max: 15 * 1024 * 1024 },
  durationSeconds: { type: Number, min: 0, max: 20 },
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: ['seller_included', 'buyer_pays_externally'],
    required: true,
    default: 'buyer_pays_externally',
  },
  estimatedDays: { type: String, trim: true },
  details: { type: String, trim: true, maxlength: 500 },
  // Compatibility only for listings created before the delivery-policy change.
  // These values are never included in Pricem checkout totals.
  cost: { type: Number, min: 0, select: false },
  option: { type: String, trim: true, select: false },
}, { _id: false });

const variantOptionSchema = new mongoose.Schema({
  value: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  minPrice: { type: Number, min: 0, select: false },
  stock: { type: Number, required: true, min: 0, default: 0 },
  sku: { type: String, trim: true },
}, { _id: false });

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  options: {
    type: [variantOptionSchema],
    validate: {
      validator(options) {
        return options.length > 0;
      },
      message: 'A variant must have at least one option',
    },
  },
}, { _id: false });

const productSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  storeName: { type: String, required: true, trim: true },
  storeSlug: { type: String, required: true, trim: true, lowercase: true, index: true },

  title: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  price: { type: Number, required: true, min: 0 },
  minPrice: { type: Number, min: 0, select: false },
  stock: { type: Number, required: true, min: 0, default: 1, index: true },
  condition: { type: String, enum: ['new', 'used'], required: true },
  description: { type: String, required: true, trim: true },
  variants: {
    type: [variantSchema],
    default: [],
    validate: {
      validator(variants) {
        return variants.length <= 5;
      },
      message: 'A product can have at most 5 variant groups',
    },
  },

  coverImage: { type: productImageSchema, required: true },
  images: {
    type: [productImageSchema],
    default: [],
  },
  media: {
    type: [productMediaSchema],
    default: [],
    validate: { validator: (media) => media.length <= 7, message: 'Add at most 7 gallery files; the cover makes 8 total' },
  },

  delivery: { type: deliverySchema, required: true },
  status: { type: String, enum: ['active', 'inactive', 'sold'], default: 'active', index: true },
  isFeatured: { type: Boolean, default: false, index: true },
  viewsCount: { type: Number, default: 0, min: 0 },
  salesCount: { type: Number, default: 0, min: 0 },
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

productSchema.index({ title: 'text', description: 'text', category: 'text' });
productSchema.index({ status: 1, stock: 1, isFeatured: -1, salesCount: -1, ratingAverage: -1, createdAt: -1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
