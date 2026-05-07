import express from 'express';
import { getPayments, createDemoPayment } from '../controllers/payment.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getPayments);
router.post('/demo', createDemoPayment);

export default router;
