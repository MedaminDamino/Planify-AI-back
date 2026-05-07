import SecurityLog from '../models/SecurityLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// GET /api/security-logs
export const getSecurityLogs = asyncHandler(async (req, res) => {
  const logs = await SecurityLog.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: logs.length, data: logs });
});
