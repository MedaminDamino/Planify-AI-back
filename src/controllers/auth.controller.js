import User from '../models/User.js';
import Profile from '../models/Profile.js';
import UserPreference from '../models/UserPreference.js';
import Subscription from '../models/Subscription.js';
import SecurityLog from '../models/SecurityLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { generateToken } from '../utils/generateToken.js';

// ─── Register ──────────────────────────────────────────────────────────────────
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Name, email, and password are required');
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'User already exists');
  }

  const user = await User.create({
    name,
    email,
    password,
    tokenBalance: 10000,
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // Create initial Profile
  await Profile.create({ userId: user._id, fullName: name });

  // Create default preferences
  await UserPreference.create({ userId: user._id });

  // Create trial subscription
  await Subscription.create({
    userId: user._id,
    plan: 'free',
    status: 'trial',
    startedAt: new Date(),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  const token = generateToken(user._id);

  const safeUser = await User.findById(user._id).select('-password');

  res.status(201).json({
    success: true,
    token,
    data: safeUser,
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    // Log failed login
    await SecurityLog.create({
      userId: user._id,
      action: 'failed_login',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'failed',
      details: 'Wrong password',
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  // Log successful login
  await SecurityLog.create({
    userId: user._id,
    action: 'login',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    status: 'success',
  });

  const token = generateToken(user._id);

  const safeUser = await User.findById(user._id).select('-password');

  res.json({
    success: true,
    token,
    data: safeUser,
  });
});

// ─── Get Me ────────────────────────────────────────────────────────────────────
export const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: req.user,
  });
});

// ─── Logout ────────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  await SecurityLog.create({
    userId: req.user._id,
    action: 'logout',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    status: 'success',
  });

  res.json({
    success: true,
    message: 'Logout successful',
  });
});
