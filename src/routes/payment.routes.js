import express from 'express';
import {
  getPayments,
  createDemoPayment,
  getPaymentMethods,
  setDefaultPaymentMethod,
  createSetupSession,
  verifySetupSession,
  deletePaymentMethod,
  getDebugMethods,
} from '../controllers/payment.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getPayments);
router.post('/demo', createDemoPayment);
router.get('/methods', getPaymentMethods);
router.get('/debug-methods', getDebugMethods);
router.post('/setup-session', createSetupSession);
router.post('/verify-setup-session', verifySetupSession);
router.post('/set-default-method', setDefaultPaymentMethod);
router.delete('/methods/:id', deletePaymentMethod);

export default router;
