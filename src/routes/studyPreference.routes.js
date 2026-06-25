import express from 'express';
import {
  getStudyPreferences,
  updateStudyPreferences,
  resetStudyPreferences,
} from '../controllers/studyPreference.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require a valid JWT session
router.use(protect);

// GET  /api/study-preferences/me   — returns (or auto-creates) user preferences
router.get('/me', getStudyPreferences);

// PUT  /api/study-preferences/me   — partial or full update with validation
router.put('/me', updateStudyPreferences);

// POST /api/study-preferences/reset — restore all defaults
router.post('/reset', resetStudyPreferences);

export default router;
