import { Router } from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  answerQuestion,
  askProductQuestion,
  listProductQuestions,
} from './questions.controller.js';
import {
  answerQuestionSchema,
  askQuestionSchema,
} from './questions.validation.js';

const router = Router();

// Public: view all questions & answers for a product
router.get('/products/:productId', listProductQuestions);

// Protected: ask a question on a product
router.post('/products/:productId', protect, validate(askQuestionSchema), askProductQuestion);

// Protected: seller answers a question
router.post('/:id/answer', protect, validate(answerQuestionSchema), answerQuestion);

export default router;
