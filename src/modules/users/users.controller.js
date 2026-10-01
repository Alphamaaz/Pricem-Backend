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

    if (user.roles.includes('seller') && user.sellerProfile?.approvalStatus === 'approved') {
      return res.status(400).json({ message: 'You are already an active seller' });
    }

    const { storeName, storeSlug: customSlug, description, bankName, accountNumber, accountName } = req.body;
    const baseToSlugify = customSlug && customSlug.trim() ? customSlug : storeName;
    const storeSlug = await generateUniqueStoreSlug(baseToSlugify);

    if (!user.roles.includes('seller')) {
      user.roles.push('seller');
    }
    user.activeRole = 'seller';

    user.sellerProfile = {
      storeName: storeName.trim(),
      storeSlug,
      description: (description || '').trim(),
      payoutDetails: {
        bankName: (bankName || '').trim(),
        accountNumber: (accountNumber || '').trim(),
        accountName: (accountName || '').trim(),
      },
      kycStatus: (bankName && accountNumber) ? 'approved' : 'not_submitted',
      approvalStatus: 'approved',
      approvedAt: new Date(),
    };

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000 && err.keyPattern?.['sellerProfile.storeSlug']) {
        return res.status(409).json({ message: 'Store slug is already taken. Please choose another.' });
      }
      throw err;
    }

    res.status(201).json({
      message: 'Your store is active! You can now start listing products immediately.',
      sellerProfile: user.sellerProfile,
      user,
    });
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
    const { fullName, contactNumber, description, bankName, accountNumber, accountName } = req.body;
    const user = req.user;
    if (fullName) user.fullName = fullName;
    if (contactNumber) user.contactNumber = contactNumber;

    if (user.sellerProfile) {
      if (description !== undefined) user.sellerProfile.description = description;
      if (bankName || accountNumber || accountName) {
        user.sellerProfile.payoutDetails = {
          bankName:      bankName      !== undefined ? bankName      : user.sellerProfile.payoutDetails?.bankName,
          accountNumber: accountNumber !== undefined ? accountNumber : user.sellerProfile.payoutDetails?.accountNumber,
          accountName:   accountName   !== undefined ? accountName   : user.sellerProfile.payoutDetails?.accountName,
        };
      }
    }

    await user.save();
    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    next(err);
  }
}
