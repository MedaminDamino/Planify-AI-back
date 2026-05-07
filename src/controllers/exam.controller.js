import Exam from '../models/Exam.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/exams
export const getExams = asyncHandler(async (req, res) => {
  const exams = await Exam.find({ userId: req.user._id }).sort({ examDate: 1 });
  res.json({ success: true, count: exams.length, data: exams });
});

// POST /api/exams
export const createExam = asyncHandler(async (req, res) => {
  const exam = await Exam.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: exam });
});

// GET /api/exams/:id
export const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.id, userId: req.user._id });
  if (!exam) throw new ApiError(404, 'Exam not found');
  res.json({ success: true, data: exam });
});

// PUT /api/exams/:id
export const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!exam) throw new ApiError(404, 'Exam not found');
  res.json({ success: true, data: exam });
});

// DELETE /api/exams/:id
export const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!exam) throw new ApiError(404, 'Exam not found');
  res.json({ success: true, message: 'Exam deleted' });
});
