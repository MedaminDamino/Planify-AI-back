import Task from '../models/Task.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/paginate.js';

// GET /api/tasks  (?search= &courseId= &status= &priority= &page= &limit= &sort=)
export const getTasks = asyncHandler(async (req, res) => {
  const { search, courseId, status, priority, page, limit, sort } = req.query;

  const filter = { userId: req.user._id };

  if (search) {
    filter.$or = [
      { title:       { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  if (courseId) filter.courseId = courseId;
  if (status)   filter.status   = status;
  if (priority) filter.priority = priority;

  const sortMap = {
    newest:   { createdAt: -1 },
    oldest:   { createdAt:  1 },
    deadline: { deadline:   1 },
    priority: { priority:  -1 },
  };
  const sortBy = sortMap[sort] || { createdAt: -1 };

  const result = await paginate(Task, filter, { page, limit, sort: sortBy });

  res.json({ success: true, ...result });
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
