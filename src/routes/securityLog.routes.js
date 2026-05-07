import express from 'express';
import { getSecurityLogs } from '../controllers/securityLog.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getSecurityLogs);

export default router;
