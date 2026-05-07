import express from 'express';
import { getBalance, getHistory, buyDemoTokens } from '../controllers/token.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/balance', getBalance);
router.get('/history', getHistory);
router.post('/buy-demo', buyDemoTokens);

export default router;
