import User from '../users/user.model.js';

// GET /api/v1/admin/sellers/pending
export async function getPendingApplications(req, res, next) {
  try {
    const applicants = await User.find({ 'sellerProfile.approvalStatus': 'pending' })
      .select('fullName email contactNumber sellerProfile createdAt');
    res.json({ applicants });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/sellers/:userId/approve
export async function approveSeller(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.sellerProfile) return res.status(400).json({ message: 'No seller application found' });

    user.sellerProfile.approvalStatus = 'approved';
    user.sellerProfile.kycStatus = 'approved';
    user.sellerProfile.approvedAt = new Date();

    if (!user.roles.includes('seller')) user.roles.push('seller');

    await user.save();
    res.json({ message: `${user.name} approved as seller`, user });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/sellers/:userId/reject
export async function rejectSeller(req, res, next) {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.sellerProfile.approvalStatus = 'rejected';
    user.sellerProfile.kycStatus = 'rejected';
    user.sellerProfile.rejectedAt = new Date();
    user.sellerProfile.rejectionReason = reason || 'No reason provided';

    await user.save();
    res.json({ message: `${user.name}'s seller application rejected` });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/users
export async function getAllUsers(req, res, next) {
  try {
    const { page, limit } = req.validatedQuery;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().select('-password').skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}
