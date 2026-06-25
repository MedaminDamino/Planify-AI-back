import Profile from '../models/Profile.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/profile/me
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user._id });
  if (!profile) {
    return res.json({ success: true, data: null });
  }

  const profileObj = profile.toObject();
  
  // Map studyGoals to goals format expected by the frontend
  profileObj.goals = (profile.studyGoals || []).map((goal) => {
    const progress = goal.targetValue > 0
      ? Math.min(100, Math.max(0, Math.round((goal.currentValue / goal.targetValue) * 100)))
      : 0;

    return {
      id: goal._id.toString(),
      title: goal.title,
      description: goal.description,
      targetValue: goal.targetValue,
      currentValue: goal.currentValue,
      unit: goal.unit,
      deadline: goal.deadline,
      status: goal.status,
      progress,
      tone: goal.status === 'completed' || progress >= 100
        ? 'success'
        : goal.status === 'archived'
        ? 'info'
        : 'primary',
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt
    };
  });

  res.json({ success: true, data: profileObj });
});

// PUT /api/profile/me
export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = [
    'fullName', 'bio', 'location', 'phone', 'university', 'program',
    'fieldOfStudy', 'academicYear', 'studentId', 'gpa', 'tags',
    'profileCompletion', 'socialLinks',
    'recoveryEmail', 'recoveryEmailVerified',
    'recoveryPhone', 'recoveryPhoneVerified',
    'backupCodesCount',
  ];

  const updates = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const profile = await Profile.findOneAndUpdate(
    { userId: req.user._id },
    updates,
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: profile });
});

// GET /api/profile/goals
export const getGoals = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user._id });
  const goals = profile ? profile.studyGoals || [] : [];
  res.json({ success: true, data: goals });
});

// POST /api/profile/goals
export const createGoal = asyncHandler(async (req, res) => {
  const { title, description, targetValue, currentValue, unit, deadline, status } = req.body;

  if (!title || targetValue === undefined) {
    return res.status(400).json({ success: false, message: 'Title and Target Value are required.' });
  }

  let profile = await Profile.findOne({ userId: req.user._id });
  if (!profile) {
    profile = await Profile.create({ userId: req.user._id });
  }

  const newGoal = {
    title,
    description,
    targetValue,
    currentValue: currentValue || 0,
    unit,
    deadline,
    status: status || 'active',
  };

  profile.studyGoals.push(newGoal);
  await profile.save();

  // Find the newly pushed goal (it will be the last element)
  const createdGoal = profile.studyGoals[profile.studyGoals.length - 1];

  res.status(201).json({ success: true, data: createdGoal });
});

// PUT /api/profile/goals/:goalId
export const updateGoal = asyncHandler(async (req, res) => {
  const { goalId } = req.params;
  const { title, description, targetValue, currentValue, unit, deadline, status } = req.body;

  const profile = await Profile.findOne({ userId: req.user._id });
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found.' });
  }

  const goal = profile.studyGoals.id(goalId);
  if (!goal) {
    return res.status(404).json({ success: false, message: 'Goal not found.' });
  }

  if (title !== undefined) goal.title = title;
  if (description !== undefined) goal.description = description;
  if (targetValue !== undefined) goal.targetValue = targetValue;
  if (currentValue !== undefined) goal.currentValue = currentValue;
  if (unit !== undefined) goal.unit = unit;
  if (deadline !== undefined) goal.deadline = deadline;
  if (status !== undefined) goal.status = status;

  await profile.save();

  res.json({ success: true, data: goal });
});

// DELETE /api/profile/goals/:goalId
export const deleteGoal = asyncHandler(async (req, res) => {
  const { goalId } = req.params;

  const profile = await Profile.findOne({ userId: req.user._id });
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found.' });
  }

  const goal = profile.studyGoals.id(goalId);
  if (!goal) {
    return res.status(404).json({ success: false, message: 'Goal not found.' });
  }

  profile.studyGoals.pull(goalId);
  await profile.save();

  res.json({ success: true, message: 'Goal deleted successfully.' });
});
