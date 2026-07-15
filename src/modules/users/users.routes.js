import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { switchRoleSchema, sellerApplySchema, updateProfileSchema } from './users.validation.js';
import { switchRole, applyToSell, getProfile, updateProfile } from './users.controller.js';

const router = Router();

router.use(protect);

router.get('/me',             getProfile);
router.patch('/me',           validate(updateProfileSchema),  updateProfile);
router.post('/switch-role',   validate(switchRoleSchema),     switchRole);
router.patch('/active-role',  validate(switchRoleSchema),     switchRole);
router.post('/seller/apply',  validate(sellerApplySchema),    applyToSell);

export default router;
