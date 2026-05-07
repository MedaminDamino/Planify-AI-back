import Course from '../models/Course.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/courses
export const getCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: courses.length, data: courses });
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
