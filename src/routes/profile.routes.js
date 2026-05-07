import express from 'express';
import { getProfile, updateProfile } from '../controllers/profile.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getProfile);
router.put('/me', updateProfile);

export default router;
