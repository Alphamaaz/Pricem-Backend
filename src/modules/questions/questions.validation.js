import { z } from 'zod';

export const askQuestionSchema = z.object({
  question: z
    .string({ required_error: 'Question is required' })
    .trim()
    .min(3, 'Question must be at least 3 characters')
    .max(500, 'Question cannot exceed 500 characters'),
});

export const answerQuestionSchema = z.object({
  answer: z
    .string({ required_error: 'Answer is required' })
    .trim()
    .min(2, 'Answer must be at least 2 characters')
    .max(1000, 'Answer cannot exceed 1000 characters'),
});
