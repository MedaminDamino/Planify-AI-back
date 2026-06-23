import TrustedDevice from '../models/TrustedDevice.js';
import UserSession from '../models/UserSession.js';
import SecurityLog from '../models/SecurityLog.js';
import Profile from '../models/Profile.js';
import UserPreference from '../models/UserPreference.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { parseUserAgent, detectDeviceType, deriveLocation } from '../utils/deviceUtils.js';

// ─── Trusted Devices ────────────────────────────────────────────────────────

// Build a human-readable device name reusing the shared UA utility
function buildDeviceName(ua = '') {
  return parseUserAgent(ua).label;
}

// GET /api/security/trusted-devices
export const getTrustedDevices = asyncHandler(async (req, res) => {
  const saved = await TrustedDevice.find({ userId: req.user._id }).sort({ createdAt: -1 });

  if (saved.length > 0) {
    return res.json({ success: true, count: saved.length, data: saved });
  }

  // ── Fallback: derive from distinct login events in SecurityLog ──────────
  const logs = await SecurityLog.find({
    userId: req.user._id,
    action: 'login',
    status: 'success',
    userAgent: { $exists: true, $ne: '' },
  })
    .sort({ createdAt: -1 })
    .limit(20);

  // Deduplicate by user-agent truncated key (keep latest per UA)
  const seen = new Map();
  for (const log of logs) {
    const key = (log.userAgent || '').slice(0, 120);
    if (!seen.has(key)) seen.set(key, log);
  }

  const derived = Array.from(seen.values()).map((log) => ({
    _id: log._id,
    userId: req.user._id,
    name: buildDeviceName(log.userAgent),
    deviceType: detectDeviceType(log.userAgent),
    userAgent: log.userAgent,
    ipAddress: log.ipAddress,
    isCurrent: false,
    createdAt: log.createdAt,
    _derived: true,
  }));

  res.json({ success: true, count: derived.length, data: derived });
});


// POST /api/security/trusted-devices
export const addTrustedDevice = asyncHandler(async (req, res) => {
  const { name, deviceType } = req.body;

  if (!name) {
    throw new ApiError(400, 'Device name is required');
  }

  const device = await TrustedDevice.create({
    userId: req.user._id,
    name,
    deviceType: deviceType || 'other',
    userAgent: req.headers['user-agent'],
    ipAddress: req.ip,
    isCurrent: false,
  });

  res.status(201).json({ success: true, data: device });
});

// DELETE /api/security/trusted-devices/:id
export const removeTrustedDevice = asyncHandler(async (req, res) => {
  const device = await TrustedDevice.findOne({ _id: req.params.id, userId: req.user._id });

  if (!device) {
    throw new ApiError(404, 'Trusted device not found');
  }

  await device.deleteOne();

  res.json({ success: true, message: 'Trusted device removed' });
});

// ─── Account Recovery ───────────────────────────────────────────────────────

// GET /api/security/recovery
export const getRecovery = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user._id }).select(
    'recoveryEmail recoveryEmailVerified recoveryPhone recoveryPhoneVerified backupCodesCount'
  );

  res.json({ success: true, data: profile || {} });
});

// PUT /api/security/recovery
export const updateRecovery = asyncHandler(async (req, res) => {
  const allowed = [
    'recoveryEmail',
    'recoveryEmailVerified',
    'recoveryPhone',
    'recoveryPhoneVerified',
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

// ─── Security Preferences (Additional Security) ─────────────────────────────

// GET /api/security/preferences
export const getSecurityPreferences = asyncHandler(async (req, res) => {
  const prefs = await UserPreference.findOne({ userId: req.user._id }).select('security');

  // Return defaults if no document yet
  const security = prefs?.security ?? {
    emailAlerts: true,
    suspiciousLoginAlerts: true,
    deviceManagementEnabled: true,
  };

  res.json({ success: true, data: security });
});

// PUT /api/security/preferences
export const updateSecurityPreferences = asyncHandler(async (req, res) => {
  const { emailAlerts, suspiciousLoginAlerts, deviceManagementEnabled } = req.body;

  const updates = {};
  if (emailAlerts !== undefined) updates['security.emailAlerts'] = emailAlerts;
  if (suspiciousLoginAlerts !== undefined) updates['security.suspiciousLoginAlerts'] = suspiciousLoginAlerts;
  if (deviceManagementEnabled !== undefined) updates['security.deviceManagementEnabled'] = deviceManagementEnabled;

  const prefs = await UserPreference.findOneAndUpdate(
    { userId: req.user._id },
    { $set: updates },
    { new: true, upsert: true }
  );

  res.json({ success: true, data: prefs.security });
});

// ─── Active Sessions ─────────────────────────────────────────────────────────

// GET /api/security/sessions
export const getSessions = asyncHandler(async (req, res) => {
  const sessions = await UserSession.find({
    userId: req.user._id,
    isActive: true,
    expiresAt: { $gt: new Date() },
  }).sort({ isCurrent: -1, lastActivityAt: -1 });

  res.json({ success: true, count: sessions.length, data: sessions });
});

// DELETE /api/security/sessions/:id  (revoke one session)
export const revokeSession = asyncHandler(async (req, res) => {
  const session = await UserSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });

  if (!session) throw new ApiError(404, 'Session not found');
  if (session.isCurrent) throw new ApiError(400, 'Cannot revoke your current session. Use logout instead.');

  session.isActive = false;
  await session.save();

  res.json({ success: true, message: 'Session revoked' });
});

// DELETE /api/security/sessions  (revoke all except current)
export const revokeAllSessions = asyncHandler(async (req, res) => {
  await UserSession.updateMany(
    { userId: req.user._id, isCurrent: false, isActive: true },
    { $set: { isActive: false } }
  );

  res.json({ success: true, message: 'All other sessions revoked' });
});
