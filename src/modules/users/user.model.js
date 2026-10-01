import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const sellerProfileSchema = new mongoose.Schema({
  storeName:    { type: String, trim: true },
  storeSlug:    { type: String, trim: true, lowercase: true },
  description:  { type: String, trim: true },
  payoutDetails: {
    bankName:      { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    accountName:   { type: String, trim: true },
  },
  kycStatus:      { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted' },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvedAt:     Date,
  rejectedAt:     Date,
  rejectionReason: String,
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
  ratingTotal: { type: Number, default: 0, min: 0, select: false },
}, { _id: false });

const userSchema = new mongoose.Schema({
  fullName:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  contactNumber: { type: String, required: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },

  // Dual-role system
  roles:      { type: [String], enum: ['buyer', 'seller', 'admin'], default: ['buyer'] },
  activeRole: { type: String, enum: ['buyer', 'seller', 'admin'], default: 'buyer' },

  sellerProfile: { type: sellerProfileSchema, default: null },

  // Email verification
  emailVerified:            { type: Boolean, default: false },
  emailVerificationToken:   { type: String, select: false },
  emailVerificationExpires: { type: Date, select: false },

  // Password reset
  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },

  // Refresh token (stored hashed)
  refreshToken: { type: String, select: false },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Never expose password or tokens in JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpires;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

userSchema.index(
  { 'sellerProfile.storeSlug': 1 },
  {
    unique: true,
    partialFilterExpression: { 'sellerProfile.storeSlug': { $type: 'string' } },
  },
);

const User = mongoose.model('User', userSchema);
export default User;
