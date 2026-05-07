import express from 'express';
import {
  getExams,
  createExam,
  getExam,
  updateExam,
  deleteExam,
} from '../controllers/exam.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getExams).post(createExam);
router.route('/:id').get(getExam).put(updateExam).delete(deleteExam);

export default router;
