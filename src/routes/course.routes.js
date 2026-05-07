import express from 'express';
import { getCourses, createCourse, getCourse, updateCourse, deleteCourse } from '../controllers/course.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createCourseSchema, updateCourseSchema } from '../validations/course.validation.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getCourses)
  .post(validate(createCourseSchema), createCourse);

router.route('/:id')
  .get(getCourse)
  .put(validate(updateCourseSchema), updateCourse)
  .delete(deleteCourse);

export default router;
