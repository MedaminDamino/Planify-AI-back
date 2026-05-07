import express from 'express';
import {
  getSchedules,
  createSchedule,
  getSchedule,
  updateSchedule,
  deleteSchedule,
} from '../controllers/schedule.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getSchedules).post(createSchedule);
router.route('/:id').get(getSchedule).put(updateSchedule).delete(deleteSchedule);

export default router;
