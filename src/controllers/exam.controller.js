import Exam from '../models/Exam.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate } from '../utils/paginate.js';

// GET /api/exams  (?search= &courseId= &status= &priority= &type= &page= &limit= &sort=)
export const getExams = asyncHandler(async (req, res) => {
  const { search, courseId, status, priority, type, page, limit, sort } = req.query;

  const filter = { userId: req.user._id };

  if (search) {
    filter.title = { $regex: search, $options: 'i' };
  }
  if (courseId) filter.courseId = courseId;
  if (status)   filter.status   = status;
  if (priority) filter.priority = priority;
  if (type)     filter.type     = type;

  const sortMap = {
    newest:   { createdAt: -1 },
    oldest:   { createdAt:  1 },
    date_asc: { examDate:   1 },
    date_desc:{ examDate:  -1 },
  };
  const sortBy = sortMap[sort] || { examDate: 1 };

  const result = await paginate(Exam, filter, { page, limit, sort: sortBy });

  res.json({ success: true, ...result });
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
