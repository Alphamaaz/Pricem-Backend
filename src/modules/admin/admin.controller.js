import mongoose from 'mongoose';
import User from '../users/user.model.js';
import Order from '../orders/order.model.js';
import Product from '../products/product.model.js';
import Offer from '../offers/offer.model.js';
import Dispute from '../disputes/dispute.model.js';
import Question from '../questions/question.model.js';
import SellerPayout from '../payouts/seller-payout.model.js';

// GET /api/v1/admin/analytics
export async function getAdminAnalytics(req, res, next) {
  try {
    const [
      totalUsers,
      totalSellers,
      pendingSellersCount,
      suspendedUsersCount,
      recentUsers,
      totalProducts,
      activeProducts,
      categoryCounts,
      stateCounts,
      orderMetrics,
      ordersByStatus,
      recentOrders,
      totalOffers,
      acceptedOffers,
      counteredOffers,
      pendingOffers,
      rejectedOffers,
      recentOffers,
      openDisputesCount,
      pendingCompletionCount,
      eligiblePayoutsCount,
      unansweredQuestionsCount,
      totalQuestionsCount,
      pendingApplications,
      openDisputes,
      pendingCompletions,
      eligiblePayouts,
      unansweredQuestions,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ roles: 'seller', 'sellerProfile.approvalStatus': 'approved' }),
      User.countDocuments({ 'sellerProfile.approvalStatus': 'pending' }),
      User.countDocuments({ isActive: false }),
      User.find().select('fullName email contactNumber roles activeRole isActive createdAt').sort({ createdAt: -1 }).limit(8),
      Product.countDocuments(),
      Product.countDocuments({ status: 'active' }),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Product.aggregate([
        { $match: { 'location.state': { $exists: true, $ne: '' } } },
        { $group: { _id: '$location.state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      Order.aggregate([
        {
          $group: {
            _id: null,
            totalGmv: { $sum: '$total' },
            completedGmv: {
              $sum: { $cond: [{ $eq: ['$orderStatus', 'completed'] }, '$total', 0] },
            },
            escrowGmv: {
              $sum: {
                $cond: [
                  { $in: ['$orderStatus', ['paid', 'processing', 'shipped']] },
                  '$total',
                  0,
                ],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
      Order.find()
        .populate('buyer', 'fullName email contactNumber')
        .populate('seller', 'fullName email contactNumber sellerProfile.storeName')
        .sort({ createdAt: -1 })
        .limit(8),
      Offer.countDocuments(),
      Offer.countDocuments({ status: 'accepted' }),
      Offer.countDocuments({ status: 'countered' }),
      Offer.countDocuments({ status: 'pending' }),
      Offer.countDocuments({ status: 'rejected' }),
      Offer.find()
        .populate('buyer', 'fullName email')
        .populate('seller', 'fullName sellerProfile.storeName')
        .sort({ createdAt: -1 })
        .limit(6),
      Dispute.countDocuments({ status: { $in: ['open', 'under_review'] } }),
      Order.countDocuments({ 'completionRequest.status': 'pending' }),
      SellerPayout.countDocuments({ status: 'eligible' }),
      Question.countDocuments({ status: 'unanswered' }),
      Question.countDocuments(),
      User.find({ 'sellerProfile.approvalStatus': 'pending' })
        .select('fullName email contactNumber sellerProfile createdAt')
        .sort({ createdAt: -1 })
        .limit(8),
      Dispute.find({ status: { $in: ['open', 'under_review'] } })
        .populate('buyer', 'fullName email contactNumber')
        .populate('seller', 'fullName email contactNumber')
        .sort({ createdAt: -1 })
        .limit(8),
      Order.find({ 'completionRequest.status': 'pending' })
        .populate('buyer', 'fullName email contactNumber')
        .populate('seller', 'fullName email contactNumber sellerProfile.storeName')
        .sort({ 'completionRequest.requestedAt': -1 })
        .limit(8),
      SellerPayout.find({ status: { $in: ['eligible', 'approved'] } })
        .populate('seller', 'fullName email contactNumber sellerProfile.payoutDetails')
        .populate('order', 'total orderStatus createdAt')
        .sort({ createdAt: -1 })
        .limit(8),
      Question.find({ status: 'unanswered' })
        .populate('product', 'title price coverImage')
        .populate('author', 'fullName email')
        .populate('seller', 'fullName sellerProfile.storeName')
        .sort({ createdAt: -1 })
        .limit(8),
    ]);

    const totalGmv = orderMetrics[0]?.totalGmv || 0;
    const completedGmv = orderMetrics[0]?.completedGmv || 0;
    const escrowGmv = orderMetrics[0]?.escrowGmv || 0;
    const totalOrdersCount = orderMetrics[0]?.count || 0;

    const statusMap = {};
    ordersByStatus.forEach((item) => {
      statusMap[item._id] = item.count;
    });

    const offerConversionRate = totalOffers > 0
      ? Math.round((acceptedOffers / totalOffers) * 100)
      : 0;

    const averageOrderValue = totalOrdersCount > 0
      ? Math.round(totalGmv / totalOrdersCount)
      : 0;

    const memoryUsageMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));

    res.json({
      analytics: {
        financials: {
          totalGmv,
          completedGmv,
          escrowGmv,
          potentialPlatformFee: Math.round(totalGmv * 0.05),
          averageOrderValue,
        },
        users: {
          total: totalUsers,
          sellers: totalSellers,
          pendingSellers: pendingSellersCount,
          suspended: suspendedUsersCount,
          recent: recentUsers,
        },
        products: {
          total: totalProducts,
          active: activeProducts,
          byCategory: categoryCounts.map((c) => ({ category: c._id || 'other', count: c.count })),
          byState: stateCounts.map((s) => ({ state: s._id, count: s.count })),
        },
        orders: {
          total: totalOrdersCount,
          byStatus: {
            pending_payment: statusMap.pending_payment || 0,
            paid: statusMap.paid || 0,
            processing: statusMap.processing || 0,
            shipped: statusMap.shipped || 0,
            delivered: statusMap.delivered || 0,
            completed: statusMap.completed || 0,
            cancelled: statusMap.cancelled || 0,
          },
          recent: recentOrders,
        },
        negotiations: {
          total: totalOffers,
          accepted: acceptedOffers,
          countered: counteredOffers,
          pending: pendingOffers,
          rejected: rejectedOffers,
          conversionRate: offerConversionRate,
          recent: recentOffers,
        },
        queues: {
          pendingSellersCount,
          openDisputesCount,
          pendingCompletionCount,
          eligiblePayoutsCount,
          unansweredQuestionsCount,
          totalQuestionsCount,
          pendingApplications,
          openDisputes,
          pendingCompletions,
          eligiblePayouts,
          unansweredQuestions,
        },
        system: {
          paymentMode: process.env.PAYMENT_MODE || 'direct_nigeria_settlement',
          dbConnected: mongoose.connection.readyState === 1,
          serverUptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          memoryUsageMb,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

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
    res.json({ message: `${user.fullName} approved as seller`, user });
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
    res.json({ message: `${user.fullName}'s seller application rejected` });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/users
export async function getAllUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = req.query.search?.trim();
    const role = req.query.role?.trim();
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { contactNumber: { $regex: search, $options: 'i' } },
        { 'sellerProfile.storeName': { $regex: search, $options: 'i' } },
      ];
    }
    if (role && ['buyer', 'seller', 'admin'].includes(role)) {
      filter.roles = role;
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').skip(skip).limit(limit).sort({ createdAt: -1 }),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:userId/toggle-status
export async function toggleUserStatus(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.roles.includes('admin') && user.isActive) {
      const adminCount = await User.countDocuments({ roles: 'admin', isActive: true });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot deactivate the sole active admin' });
      }
    }

    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.fullName} is now ${user.isActive ? 'active' : 'suspended'}`, user });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/questions/:questionId/hide
export async function hideQuestion(req, res, next) {
  try {
    const question = await Question.findById(req.params.questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    question.status = 'hidden';
    await question.save();
    res.json({ message: 'Question moderated and hidden from marketplace', question });
  } catch (err) {
    next(err);
  }
}

