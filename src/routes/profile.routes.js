import express from 'express';
import {
  getProfile,
  updateProfile,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
} from '../controllers/profile.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getProfile);
router.put('/me', updateProfile);

router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.put('/goals/:goalId', updateGoal);
router.delete('/goals/:goalId', deleteGoal);

export default router;
