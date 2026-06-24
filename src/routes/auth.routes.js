import express from 'express';
import { register, login, me, logout, firebaseAuth } from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema, firebaseAuthSchema } from '../validations/auth.validation.js';

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login',    validate(loginSchema),    login);
router.post('/firebase',  validate(firebaseAuthSchema), firebaseAuth);
router.get('/me',        protect,                  me);
router.post('/logout',   protect,                  logout);

export default router;
