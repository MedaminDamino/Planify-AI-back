import Course from '../models/Course.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/paginate.js';

// GET /api/courses  (?search= &status= &priority= &page= &limit= &sort=)
export const getCourses = asyncHandler(async (req, res) => {
  const { search, status, priority, page, limit, sort } = req.query;

  const filter = { userId: req.user._id };

  if (search) {
    filter.$or = [
      { title:       { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }
  if (status)   filter.status   = status;
  if (priority) filter.priority = priority;

  const sortMap = {
    newest:   { createdAt: -1 },
    oldest:   { createdAt:  1 },
    title:    { title:      1 },
    progress: { progress:  -1 },
  };
  const sortBy = sortMap[sort] || { createdAt: -1 };

  const result = await paginate(Course, filter, { page, limit, sort: sortBy });

  res.json({ success: true, ...result });
});

// POST /api/courses
export const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: course });
});

// GET /api/courses/:id
export const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, userId: req.user._id });
  if (!course) throw new ApiError(404, 'Course not found');
  res.json({ success: true, data: course });
});

// PUT /api/courses/:id
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!course) throw new ApiError(404, 'Course not found');
  res.json({ success: true, data: course });
});

// DELETE /api/courses/:id
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!course) throw new ApiError(404, 'Course not found');
  res.json({ success: true, message: 'Course deleted' });
});
