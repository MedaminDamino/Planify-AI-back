import express from 'express';
import {
  getPayments,
  createDemoPayment,
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
} from '../controllers/payment.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getPayments);
router.post('/demo', createDemoPayment);
router.get('/methods', getPaymentMethods);
router.post('/methods', addPaymentMethod);
router.delete('/methods/:id', deletePaymentMethod);

export default router;
