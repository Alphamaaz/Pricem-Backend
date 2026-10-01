import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { createItemReview, createSellerReview, getOrderReviewEligibility, listProductReviews, listSellerReviews } from './reviews.controller.js';
import { itemReviewSchema, listReviewsQuerySchema, sellerReviewSchema } from './reviews.validation.js';

const router = Router();
router.get('/products/:productId', validateQuery(listReviewsQuerySchema), listProductReviews);
router.get('/sellers/:sellerId', validateQuery(listReviewsQuerySchema), listSellerReviews);
router.get('/orders/:orderId/eligibility', protect, getOrderReviewEligibility);
router.post('/orders/:orderId/items/:productId', protect, validate(itemReviewSchema), createItemReview);
router.post('/orders/:orderId/seller', protect, validate(sellerReviewSchema), createSellerReview);
export default router;
