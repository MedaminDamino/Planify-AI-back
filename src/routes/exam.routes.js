import express from 'express';
import { getExams, createExam, getExam, updateExam, deleteExam } from '../controllers/exam.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createExamSchema, updateExamSchema } from '../validations/exam.validation.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getExams)
  .post(validate(createExamSchema), createExam);

router.route('/:id')
  .get(getExam)
  .put(validate(updateExamSchema), updateExam)
  .delete(deleteExam);

export default router;
