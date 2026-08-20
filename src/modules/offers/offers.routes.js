import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate, validateQuery } from '../../middlewares/validate.middleware.js';
import {
  createOfferSchema,
  counterOfferSchema,
  listOffersQuerySchema,
  markOffersReadSchema,
} from './offers.validation.js';
import {
  createOffer,
  listOffers,
  counterOffer,
  acceptOffer,
  rejectOffer,
  markOffersRead,
} from './offers.controller.js';

const router = Router();

router.use(protect);

router.get('/', validateQuery(listOffersQuerySchema), listOffers);
router.post('/', validate(createOfferSchema), createOffer);
router.patch('/read', validate(markOffersReadSchema), markOffersRead);
router.patch('/:id/counter', validate(counterOfferSchema), counterOffer);
router.patch('/:id/accept', acceptOffer);
router.patch('/:id/reject', rejectOffer);

export default router;
