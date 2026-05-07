import express from 'express';
import {
  getStudySessions,
  createStudySession,
  getStudySession,
  updateStudySession,
  deleteStudySession,
} from '../controllers/studySession.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getStudySessions).post(createStudySession);
router.route('/:id').get(getStudySession).put(updateStudySession).delete(deleteStudySession);

export default router;
