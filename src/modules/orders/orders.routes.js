import { Router } from 'express';
import { protect, requireRole } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { checkoutCartSchema, checkoutOfferSchema, completionDecisionSchema, completionRequestSchema, deliveryArrangementSchema, listOrdersQuerySchema, shipmentSchema } from './orders.validation.js';
import { uploadOrderEvidence } from '../../middlewares/upload.middleware.js';
import {
  acknowledgeDeliveryArrangement,
  checkoutCart,
  checkoutOffer,
  confirmDelivery,
  getOrderById,
  getActiveOrderCount,
  listOrders,
  markDelivered,
  markShipped,
  proposeDeliveryArrangement,
  startProcessing,
  requestOrderCompletion,
  listCompletionRequests,
  reviewCompletionRequest,
  getSellerAnalytics,
} from './orders.controller.js';

const router = Router();

router.use(protect);

router.post('/checkout/cart', validate(checkoutCartSchema), checkoutCart);
router.get('/completion-requests', requireRole('admin'), listCompletionRequests);
router.get('/', validateQuery(listOrdersQuerySchema), listOrders);
router.get('/active-count', getActiveOrderCount);
router.get('/seller/analytics', getSellerAnalytics);
router.patch('/:id/checkout-offer', validate(checkoutOfferSchema), checkoutOffer);
router.patch('/:id/delivery-arrangement', validate(deliveryArrangementSchema), proposeDeliveryArrangement);
router.patch('/:id/delivery-arrangement/acknowledge', acknowledgeDeliveryArrangement);
router.patch('/:id/processing', startProcessing);
router.patch('/:id/shipment', validate(shipmentSchema), markShipped);
router.patch('/:id/mark-delivered', markDelivered);
router.patch('/:id/confirm-delivery', confirmDelivery);
router.post('/:id/completion-request', uploadOrderEvidence, validate(completionRequestSchema), requestOrderCompletion);
router.patch('/:id/completion-request/review', requireRole('admin'), validate(completionDecisionSchema), reviewCompletionRequest);
router.get('/:id', getOrderById);

export default router;
