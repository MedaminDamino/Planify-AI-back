import express from 'express';
import {
  getNotifications,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getNotifications).post(createNotification);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

export default router;
