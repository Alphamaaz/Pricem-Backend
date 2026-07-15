import User from './user.model.js';

function slugifyStoreName(storeName) {
  const slug = storeName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'store';
}

async function generateUniqueStoreSlug(storeName) {
  const baseSlug = slugifyStoreName(storeName);
  let slug = baseSlug;
  let suffix = 2;

  while (await User.exists({ 'sellerProfile.storeSlug': slug })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

// POST /api/v1/users/switch-role
// Lightweight toggle — no re-auth needed. Guards on backend are role-based, never activeRole-based.
export async function switchRole(req, res, next) {
  try {
    const { role } = req.body;
    const user = req.user;

    if (!user.roles.includes(role)) {
      return res.status(403).json({ message: `You do not have the '${role}' role` });
    }

    if (role === 'seller' && user.sellerProfile?.approvalStatus !== 'approved') {
      return res.status(403).json({ message: 'Your seller account is not approved yet' });
    }

    user.activeRole = role;
    await user.save();

    res.json({ message: `Switched to ${role} mode`, activeRole: user.activeRole, user });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/users/seller/apply
export async function applyToSell(req, res, next) {
  try {
    const user = req.user;

    if (user.roles.includes('seller')) {
      return res.status(400).json({ message: 'You are already a seller' });
    }
    if (user.sellerProfile?.approvalStatus === 'pending') {
      return res.status(400).json({ message: 'Your seller application is already under review' });
    }

    const { storeName, description, bankName, accountNumber, accountName } = req.body;
    const storeSlug = await generateUniqueStoreSlug(storeName);

    user.sellerProfile = {
      storeName,
      storeSlug,
      description,
      payoutDetails: { bankName, accountNumber, accountName },
      kycStatus: 'pending',
      approvalStatus: 'pending',
    };

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.['sellerProfile.storeSlug']) {
        return res.status(409).json({ message: 'Store slug is already taken. Please try again.' });
      }
      throw err;
    }

    res.status(201).json({ message: 'Seller application submitted. Awaiting admin approval.', sellerProfile: user.sellerProfile });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/users/me
export async function getProfile(req, res) {
  res.json({ user: req.user });
}

// PATCH /api/v1/users/me
export async function updateProfile(req, res, next) {
  try {
    const { fullName } = req.body;
    const user = req.user;
    if (fullName) user.fullName = fullName;
    await user.save();
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
