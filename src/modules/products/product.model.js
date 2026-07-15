import mongoose from 'mongoose';

const productImageSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  publicId: { type: String, trim: true },
  alt: { type: String, trim: true },
}, { _id: false });

const deliverySchema = new mongoose.Schema({
  cost: { type: Number, required: true, min: 0 },
  option: { type: String, required: true, trim: true },
  estimatedDays: { type: String, required: true, trim: true },
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
    validate: {
      validator(images) {
        return images.length <= 10;
      },
      message: 'A product can have at most 10 images',
    },
    default: [],
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
