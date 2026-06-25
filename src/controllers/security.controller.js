import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import TrustedDevice from '../models/TrustedDevice.js';
import UserSession from '../models/UserSession.js';
import SecurityLog from '../models/SecurityLog.js';
import Profile from '../models/Profile.js';
import UserPreference from '../models/UserPreference.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { parseUserAgent, detectDeviceType, deriveLocation } from '../utils/deviceUtils.js';
import { verifyTOTP, generateSecret } from '../utils/totp.js';

// ─── Trusted Devices ────────────────────────────────────────────────────────

// Build a human-readable device name reusing the shared UA utility
function buildDeviceName(ua = '') {
  return parseUserAgent(ua).label;
}

// GET /api/security/trusted-devices
export const getTrustedDevices = asyncHandler(async (req, res) => {
  const saved = await TrustedDevice.find({ userId: req.user._id }).sort({ createdAt: -1 });
  const currentUserAgent = req.headers['user-agent'] || '';

  if (saved.length > 0) {
    const mapped = saved.map(device => ({
      ...device.toObject(),
      isCurrent: device.userAgent === currentUserAgent
    }));
    return res.json({ success: true, count: mapped.length, data: mapped });
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
    isCurrent: log.userAgent === currentUserAgent,
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
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  }).sort({ lastActivity: -1 });

  const mappedSessions = sessions.map(s => {
    const isCurrent = req.sessionId ? s._id.toString() === req.sessionId.toString() : s.isCurrent;
    return {
      ...s.toObject(),
      isCurrent,
    };
  });

  // Deduplicate by fingerprint (keep the first/latest active one per fingerprint)
  const uniqueSessions = [];
  const seenFingerprints = new Set();

  for (const session of mappedSessions) {
    const fp = session.fingerprint || `${session.userId}_${session.os}_${session.browser}_${session.deviceType}_${session.deviceId || ''}`;
    if (!seenFingerprints.has(fp)) {
      seenFingerprints.add(fp);
      uniqueSessions.push(session);
    } else {
      const existingIdx = uniqueSessions.findIndex(s => {
        const sFp = s.fingerprint || `${s.userId}_${s.os}_${s.browser}_${s.deviceType}_${s.deviceId || ''}`;
        return sFp === fp;
      });
      if (session.isCurrent && existingIdx !== -1) {
        uniqueSessions[existingIdx] = session;
      }
    }
  }

  // Sort current session first
  uniqueSessions.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));

  res.json({ success: true, count: uniqueSessions.length, data: uniqueSessions });
});

// DELETE /api/security/sessions/:id  (revoke one session)
export const revokeSession = asyncHandler(async (req, res) => {
  const session = await UserSession.findOne({
    _id: req.params.id,
    userId: req.user._id,
    isRevoked: false,
  });

  if (!session) throw new ApiError(404, 'Session not found');
  const isCurrent = req.sessionId ? session._id.toString() === req.sessionId.toString() : session.isCurrent;
  if (isCurrent) throw new ApiError(400, 'Cannot revoke your current session. Use logout instead.');

  session.isRevoked = true;
  session.isActive = false;
  await session.save();

  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  await SecurityLog.create({
    userId: req.user._id,
    action: 'session_revoked',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location: location || undefined,
    status: 'success',
    details: `Revoked session on device: ${session.device} - ${session.browser}`,
  });

  res.json({ success: true, message: 'Session revoked successfully' });
});

// DELETE /api/security/sessions  (revoke all except current)
export const revokeAllSessions = asyncHandler(async (req, res) => {
  const query = { userId: req.user._id, isRevoked: false };
  if (req.sessionId) {
    query._id = { $ne: req.sessionId };
  } else {
    query.isCurrent = false;
  }

  await UserSession.updateMany(
    query,
    { $set: { isRevoked: true, isActive: false } }
  );

  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  await SecurityLog.create({
    userId: req.user._id,
    action: 'sessions_revoked',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location: location || undefined,
    status: 'success',
    details: 'All other active sessions revoked',
  });

  res.json({ success: true, message: 'All other sessions revoked successfully' });
});

// ─── Two-Factor Authentication ───────────────────────────────────────────────

// GET /api/security/2fa
export const get2fa = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const profile = await Profile.findOne({ userId: req.user._id });
  res.json({
    success: true,
    data: {
      enabled: user.twoFactorEnabled || false,
      method: user.twoFactorMethod || 'none',
      backupCodesCount: profile?.backupCodesCount || 0
    }
  });
});

// POST /api/security/2fa/setup
export const setup2fa = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.twoFactorEnabled) {
    throw new ApiError(400, 'Two-factor authentication is already enabled');
  }

  const secret = generateSecret();
  user.twoFactorSecret = secret;
  await user.save();

  const otpauthUrl = `otpauth://totp/Planify%20AI:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Planify%20AI`;

  res.json({
    success: true,
    data: {
      secret,
      otpauthUrl
    }
  });
});

// POST /api/security/2fa/verify
export const verify2fa = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    throw new ApiError(400, 'Verification token is required');
  }

  const user = await User.findById(req.user._id).select('+twoFactorSecret');
  if (!user || !user.twoFactorSecret) {
    throw new ApiError(400, '2FA setup was not initiated. Please start setup first.');
  }

  const isValid = verifyTOTP(token, user.twoFactorSecret);

  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  if (!isValid) {
    await SecurityLog.create({
      userId: user._id,
      action: 'security_update',
      ipAddress: ip,
      userAgent: ua,
      device: deviceLabel,
      location: location || undefined,
      status: 'failed',
      details: '2FA verification code failed',
    });
    throw new ApiError(400, 'Invalid verification code. Please try again.');
  }

  // Generate 10 backup codes
  const plainCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase(); // e.g. "A1B2C3D4E5"
    plainCodes.push(code);
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(code, salt);
    hashedCodes.push(hashed);
  }

  user.twoFactorEnabled = true;
  user.twoFactorMethod = 'authenticator';
  user.backupCodes = hashedCodes;
  await user.save();

  await Profile.findOneAndUpdate(
    { userId: user._id },
    { backupCodesCount: 10 },
    { upsert: true }
  );

  await SecurityLog.create({
    userId: user._id,
    action: 'security_update',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location: location || undefined,
    status: 'success',
    details: '2FA enabled successfully',
  });

  res.json({
    success: true,
    data: {
      backupCodes: plainCodes
    }
  });
});

// POST /api/security/2fa/disable
export const disable2fa = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  user.twoFactorEnabled = false;
  user.twoFactorMethod = 'none';
  user.twoFactorSecret = undefined;
  user.backupCodes = [];
  await user.save();

  await Profile.findOneAndUpdate(
    { userId: user._id },
    { backupCodesCount: 0 }
  );

  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  await SecurityLog.create({
    userId: user._id,
    action: 'security_update',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location: location || undefined,
    status: 'success',
    details: '2FA disabled successfully',
  });

  res.json({
    success: true,
    message: 'Two-factor authentication disabled successfully'
  });
});

// GET /api/security/backup-codes
export const getBackupCodesInfo = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ userId: req.user._id }).select('backupCodesCount');
  res.json({
    success: true,
    data: {
      count: profile?.backupCodesCount || 0
    }
  });
});

// POST /api/security/backup-codes/regenerate
export const regenerateBackupCodes = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user.twoFactorEnabled) {
    throw new ApiError(400, '2FA must be enabled to generate backup codes');
  }

  const plainCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    plainCodes.push(code);
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(code, salt);
    hashedCodes.push(hashed);
  }

  user.backupCodes = hashedCodes;
  await user.save();

  await Profile.findOneAndUpdate(
    { userId: user._id },
    { backupCodesCount: 10 }
  );

  const ua = req.headers['user-agent'] || '';
  const ip = req.ip || '';
  const { label: deviceLabel } = parseUserAgent(ua);
  const location = deriveLocation(ip);

  await SecurityLog.create({
    userId: user._id,
    action: 'security_update',
    ipAddress: ip,
    userAgent: ua,
    device: deviceLabel,
    location: location || undefined,
    status: 'success',
    details: 'Backup codes regenerated successfully',
  });

  res.json({
    success: true,
    data: {
      backupCodes: plainCodes
    }
  });
});
