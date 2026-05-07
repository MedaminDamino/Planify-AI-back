import express from 'express';
import {
  generateDailyPlan,
  summarize,
  generateExercises,
  chat,
} from '../controllers/ai.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.post('/daily-plan', generateDailyPlan);
router.post('/summarize', summarize);
router.post('/generate-exercises', generateExercises);
router.post('/chat', chat);

export default router;
