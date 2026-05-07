import Task from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/tasks
export const getTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: tasks.length, data: tasks });
});

// POST /api/tasks
export const createTask = asyncHandler(async (req, res) => {
  const task = await Task.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: task });
});

// GET /api/tasks/:id
export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
  if (!task) throw new ApiError(404, 'Task not found');
  res.json({ success: true, data: task });
});

// PUT /api/tasks/:id
export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!task) throw new ApiError(404, 'Task not found');
  res.json({ success: true, data: task });
});

// DELETE /api/tasks/:id
export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!task) throw new ApiError(404, 'Task not found');
  res.json({ success: true, message: 'Task deleted' });
});
