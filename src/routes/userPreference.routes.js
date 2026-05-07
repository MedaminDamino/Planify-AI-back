import express from 'express';
import { getPreferences, updatePreferences } from '../controllers/userPreference.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getPreferences);
router.put('/me', updatePreferences);

export default router;
