import ScheduleEvent from '../models/ScheduleEvent.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/schedules  (optional: ?courseId= &start= &end= &type=)
export const getSchedules = asyncHandler(async (req, res) => {
  const { courseId, start, end, type } = req.query;

  const filter = { userId: req.user._id };

  if (courseId) filter.courseId = courseId;
  if (type)     filter.type     = type;

  // Date range: events whose start falls within [start, end]
  if (start || end) {
    filter.start = {};
    if (start) filter.start.$gte = new Date(start);
    if (end)   filter.start.$lte = new Date(end);
  }

  const events = await ScheduleEvent.find(filter).sort({ start: 1 });
  res.json({ success: true, count: events.length, data: events });
});

// POST /api/schedules
export const createSchedule = asyncHandler(async (req, res) => {
  const event = await ScheduleEvent.create({ ...req.body, userId: req.user._id });
  res.status(201).json({ success: true, data: event });
});

// GET /api/schedules/:id
export const getSchedule = asyncHandler(async (req, res) => {
  const event = await ScheduleEvent.findOne({ _id: req.params.id, userId: req.user._id });
  if (!event) throw new ApiError(404, 'Schedule event not found');
  res.json({ success: true, data: event });
});

// PUT /api/schedules/:id
export const updateSchedule = asyncHandler(async (req, res) => {
  const event = await ScheduleEvent.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!event) throw new ApiError(404, 'Schedule event not found');
  res.json({ success: true, data: event });
});

// DELETE /api/schedules/:id
export const deleteSchedule = asyncHandler(async (req, res) => {
  const event = await ScheduleEvent.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!event) throw new ApiError(404, 'Schedule event not found');
  res.json({ success: true, message: 'Schedule event deleted' });
});
