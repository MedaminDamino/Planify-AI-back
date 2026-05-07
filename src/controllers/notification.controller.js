import Notification from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/notifications
export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: notifications.length, data: notifications });
});

// POST /api/notifications
export const createNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: notification });
});

// PUT /api/notifications/:id/read
export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, data: notification });
});

// PUT /api/notifications/read-all
export const markAllAsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ success: true, message: 'All notifications marked as read' });
});

// DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!notification) throw new ApiError(404, 'Notification not found');
  res.json({ success: true, message: 'Notification deleted' });
});
