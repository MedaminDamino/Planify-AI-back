import express from 'express';
import {
  getSubscription,
  demoUpgrade,
  cancelDemoSubscription,
} from '../controllers/subscription.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/me', getSubscription);
router.post('/demo-upgrade', demoUpgrade);
router.post('/cancel-demo', cancelDemoSubscription);

export default router;
