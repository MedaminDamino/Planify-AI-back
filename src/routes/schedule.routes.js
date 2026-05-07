import express from 'express';
import { getSchedules, createSchedule, getSchedule, updateSchedule, deleteSchedule } from '../controllers/schedule.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createScheduleSchema, updateScheduleSchema } from '../validations/schedule.validation.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getSchedules)
  .post(validate(createScheduleSchema), createSchedule);

router.route('/:id')
  .get(getSchedule)
  .put(validate(updateScheduleSchema), updateSchedule)
  .delete(deleteSchedule);

export default router;
