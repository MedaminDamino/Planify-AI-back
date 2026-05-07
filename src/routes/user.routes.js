import express from 'express';
import { getMe, updateMe } from '../controllers/user.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getMe);
router.put('/me', updateMe);

export default router;
