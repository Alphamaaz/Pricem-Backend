import mongoose from 'mongoose';

const offerVariantSelectionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  value: { type: String, required: true, trim: true },
}, { _id: false });

const offerHistorySchema = new mongoose.Schema({
  proposedBy: { type: String, enum: ['buyer', 'seller'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  price: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const offerSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  productTitle: { type: String, required: true, trim: true },
  storeName: { type: String, required: true, trim: true },
  storeSlug: { type: String, required: true, trim: true },
  coverImage: {
    url: { type: String, required: true, trim: true },
    alt: { type: String, trim: true },
  },

  variantSelections: { type: [offerVariantSelectionSchema], default: [] },
  variantKey: { type: String, default: '', trim: true },

  listedPrice: { type: Number, required: true, min: 0 },
  currentPrice: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['pending', 'countered', 'accepted', 'rejected', 'expired'],
    default: 'pending',
    index: true,
  },
  lastProposedBy: { type: String, enum: ['buyer', 'seller'], required: true },
  history: { type: [offerHistorySchema], required: true },

  acceptedAt: Date,
  rejectedAt: Date,
  expiredAt: Date,
}, { timestamps: true });

offerSchema.index({ product: 1, buyer: 1, seller: 1, variantKey: 1, status: 1 });

const Offer = mongoose.model('Offer', offerSchema);
export default Offer;
