import express from 'express';
import {
  getTrustedDevices,
  addTrustedDevice,
  removeTrustedDevice,
  getRecovery,
  updateRecovery,
  getSecurityPreferences,
  updateSecurityPreferences,
  getSessions,
  revokeSession,
  revokeAllSessions,
} from '../controllers/security.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// ─── Active Sessions ──────────────────────────────────────────────────────────
router.get('/sessions',           getSessions);
router.delete('/sessions',        revokeAllSessions);   // revoke all other sessions
router.delete('/sessions/:id',    revokeSession);       // revoke a specific session

// ─── Trusted Devices ──────────────────────────────────────────────────────────
router.get('/trusted-devices',          getTrustedDevices);
router.post('/trusted-devices',         addTrustedDevice);
router.delete('/trusted-devices/:id',   removeTrustedDevice);

// ─── Account Recovery ─────────────────────────────────────────────────────────
router.get('/recovery',   getRecovery);
router.put('/recovery',   updateRecovery);

// ─── Additional Security Preferences ─────────────────────────────────────────
router.get('/preferences',  getSecurityPreferences);
router.put('/preferences',  updateSecurityPreferences);

export default router;
