import StudySession from '../models/StudySession.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/study-sessions
export const getStudySessions = asyncHandler(async (req, res) => {
  const sessions = await StudySession.find({ userId: req.user._id }).sort({ startTime: -1 });
  res.json({ success: true, count: sessions.length, data: sessions });
});

// POST /api/study-sessions
export const createStudySession = asyncHandler(async (req, res) => {
  const session = await StudySession.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: session });
});

// GET /api/study-sessions/:id
export const getStudySession = asyncHandler(async (req, res) => {
  const session = await StudySession.findOne({ _id: req.params.id, userId: req.user._id });
  if (!session) throw new ApiError(404, 'Study session not found');
  res.json({ success: true, data: session });
});

// PUT /api/study-sessions/:id
export const updateStudySession = asyncHandler(async (req, res) => {
  const session = await StudySession.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!session) throw new ApiError(404, 'Study session not found');
  res.json({ success: true, data: session });
});

// DELETE /api/study-sessions/:id
export const deleteStudySession = asyncHandler(async (req, res) => {
  const session = await StudySession.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!session) throw new ApiError(404, 'Study session not found');
  res.json({ success: true, message: 'Study session deleted' });
});
