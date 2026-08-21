import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import { checkoutCartSchema, checkoutOfferSchema, deliveryArrangementSchema, listOrdersQuerySchema, shipmentSchema } from './orders.validation.js';
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
} from './orders.controller.js';

const router = Router();

router.use(protect);

router.post('/checkout/cart', validate(checkoutCartSchema), checkoutCart);
router.get('/', validateQuery(listOrdersQuerySchema), listOrders);
router.get('/active-count', getActiveOrderCount);
router.patch('/:id/checkout-offer', validate(checkoutOfferSchema), checkoutOffer);
router.patch('/:id/delivery-arrangement', validate(deliveryArrangementSchema), proposeDeliveryArrangement);
router.patch('/:id/delivery-arrangement/acknowledge', acknowledgeDeliveryArrangement);
router.patch('/:id/processing', startProcessing);
router.patch('/:id/shipment', validate(shipmentSchema), markShipped);
router.patch('/:id/mark-delivered', markDelivered);
router.patch('/:id/confirm-delivery', confirmDelivery);
router.get('/:id', getOrderById);

export default router;
