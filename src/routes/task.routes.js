import express from 'express';
import { getTasks, createTask, getTask, updateTask, deleteTask } from '../controllers/task.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { createTaskSchema, updateTaskSchema } from '../validations/task.validation.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getTasks)
  .post(validate(createTaskSchema), createTask);

router.route('/:id')
  .get(getTask)
  .put(validate(updateTaskSchema), updateTask)
  .delete(deleteTask);

export default router;
