import User from '../models/User.js';
import Profile from '../models/Profile.js';
import UserPreference from '../models/UserPreference.js';
import Subscription from '../models/Subscription.js';
import SecurityLog from '../models/SecurityLog.js';
import UserSession from '../models/UserSession.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { generateToken } from '../utils/generateToken.js';
import { parseUserAgent, deriveLocation, detectDeviceType } from '../utils/deviceUtils.js';
import { env } from '../config/env.js';
import { verifyFirebaseIdToken } from '../utils/verifyFirebaseIdToken.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse JWT expiry string (e.g. "7d", "24h", "3600") → milliseconds.
 * Falls back to 7 days if the format is unrecognised.
 */
function jwtExpiryToMs(expiry = '7d') {
  const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = String(expiry).match(/^(\d+)([smhd])$/i);
  if (match) return parseInt(match[1]) * (units[match[2].toLowerCase()] || 86_400_000);
  const raw = parseInt(expiry);
  return isNaN(raw) ? 7 * 86_400_000 : raw * 1000;
}

async function seedDefaultAccountData(userId, fullName, plan = 'free') {
  await Promise.all([
    Profile.create({ userId, fullName }),
    UserPreference.create({ userId }),
    Subscription.create({
      userId,
      plan,
      status: 'trial',
      startedAt: new Date(),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
  ]);
}

async function persistAuthSession(user, req, action, details = '') {
  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { os, browser, label: deviceLabel } = parseUserAgent(ua);
  const deviceType = detectDeviceType(ua);
  const location = deriveLocation(ip);
  const expiresAt = new Date(Date.now() + jwtExpiryToMs(env.jwtExpiresIn));

  await UserSession.updateMany(
    { userId: user._id, isActive: true },
    { $set: { isCurrent: false } }
  );

  await UserSession.create({
    userId: user._id,
    device: os,
    browser,
    deviceType,
    ipAddress: ip,
    location,
    isCurrent: true,
    isActive: true,
    lastActivityAt: new Date(),
    expiresAt,
  });

  await SecurityLog.create({
    userId: user._id,
    action,
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location,
    status: 'success',
    ...(details ? { details } : {}),
  });
}

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
    authProvider: 'local',
    tokenBalance: 10000,
    trialStartedAt: new Date(),
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await seedDefaultAccountData(user._id, name, 'free');

  const token = generateToken(user._id);
  const safeUser = await User.findById(user._id).select('-password');

  res.status(201).json({ success: true, token, data: safeUser });
});

// ─── Login ─────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new ApiError(401, 'Invalid credentials');

  if (user.authProvider === 'firebase' && !user.password) {
    throw new ApiError(401, 'This account uses Google sign-in. Please continue with Google.');
  }

  const isPasswordValid = await user.comparePassword(password);
  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { os, browser, label: deviceLabel } = parseUserAgent(ua);
  const deviceType = detectDeviceType(ua);
  const location = deriveLocation(ip);

  if (!isPasswordValid) {
    await SecurityLog.create({
      userId: user._id,
      action: 'failed_login',
      ipAddress: ip,
      userAgent: ua,
      device: deviceLabel,
      location,
      status: 'failed',
      details: 'Wrong password',
    });
    throw new ApiError(401, 'Invalid credentials');
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);
  await persistAuthSession(user, req, 'login');

  const safeUser = await User.findById(user._id).select('-password');

  res.json({ success: true, token, data: safeUser });
});

// â”€â”€â”€ Firebase Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const firebaseAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, 'Firebase ID token is required');
  }

  const decoded = await verifyFirebaseIdToken(idToken);
  const email = String(decoded.email || '').trim().toLowerCase();

  if (!email) {
    throw new ApiError(400, 'Firebase account is missing an email address');
  }

  const firebaseUid = String(decoded.user_id || decoded.sub || '').trim();
  const displayName = String(decoded.name || decoded.email || 'Planify user').trim();
  const avatar = String(decoded.picture || '').trim();
  const emailVerified = Boolean(decoded.email_verified);

  const userQuery = [{ email }];

  if (firebaseUid) {
    userQuery.unshift({ firebaseUid });
  }

  let user = await User.findOne({
    $or: userQuery
  });

  let createdUser = false;

  if (!user) {
    user = await User.create({
      name: displayName,
      email,
      authProvider: 'firebase',
      firebaseUid,
      avatar: avatar || undefined,
      isVerified: emailVerified,
      tokenBalance: 10000,
      trialStartedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    createdUser = true;
    await seedDefaultAccountData(user._id, displayName, 'free');
  } else {
    const updates = {};

    if (firebaseUid && user.firebaseUid !== firebaseUid) {
      updates.firebaseUid = firebaseUid;
    }

    if (!user.name && displayName) {
      updates.name = displayName;
    }

    if (avatar && user.avatar !== avatar) {
      updates.avatar = avatar;
    }

    if (emailVerified && !user.isVerified) {
      updates.isVerified = true;
    }

    if (user.authProvider !== 'firebase' && !user.password) {
      updates.authProvider = 'firebase';
    }

    if (Object.keys(updates).length > 0) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      user = await User.findById(user._id);
    }
  }

  if (!user) {
    throw new ApiError(500, 'Unable to create user session');
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        lastLoginAt: new Date(),
        isVerified: emailVerified || user.isVerified,
        avatar: avatar || user.avatar || undefined,
        authProvider: user.authProvider === 'local' ? 'local' : 'firebase',
      }
    }
  );

  await persistAuthSession(user, req, createdUser ? 'register' : 'login', 'Firebase authentication');

  const token = generateToken(user._id);
  const safeUser = await User.findById(user._id).select('-password');

  res.json({ success: true, token, data: safeUser });
});

// ─── Get Me ────────────────────────────────────────────────────────────────────
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
});

// ─── Logout ────────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  // Deactivate the current session so it no longer appears in Active Sessions
  await UserSession.updateMany(
    { userId: req.user._id, isCurrent: true, isActive: true },
    { $set: { isActive: false, isCurrent: false } }
  );

  await SecurityLog.create({
    userId: req.user._id,
    action: 'logout',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location,
    status: 'success',
  });

  res.json({ success: true, message: 'Logout successful' });
});
