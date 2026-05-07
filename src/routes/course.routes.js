import express from 'express';
import {
  getCourses,
  createCourse,
  getCourse,
  updateCourse,
  deleteCourse,
} from '../controllers/course.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getCourses).post(createCourse);
router.route('/:id').get(getCourse).put(updateCourse).delete(deleteCourse);

export default router;
