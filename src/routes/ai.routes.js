import express from 'express';
import { generateDailyPlan, summarize, generateExercises, chat } from '../controllers/ai.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  dailyPlanSchema,
  summarizeSchema,
  generateExercisesSchema,
  chatSchema,
} from '../validations/ai.validation.js';

const router = express.Router();

router.use(protect);

router.post('/daily-plan',          validate(dailyPlanSchema),          generateDailyPlan);
router.post('/summarize',           validate(summarizeSchema),           summarize);
router.post('/generate-exercises',  validate(generateExercisesSchema),  generateExercises);
router.post('/chat',                validate(chatSchema),               chat);

export default router;
