import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { apiLimiter, authLimiter } from './middlewares/rateLimit.middleware.js';
import { mongoSanitizeMiddleware } from './middlewares/mongoSanitize.middleware.js';
import { xssSanitize } from './middlewares/xss.middleware.js';

// ─── Route Imports ─────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import profileRoutes from './routes/profile.routes.js';
import courseRoutes from './routes/course.routes.js';
import taskRoutes from './routes/task.routes.js';
import examRoutes from './routes/exam.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import studySessionRoutes from './routes/studySession.routes.js';
import fileRoutes from './routes/file.routes.js';
import tokenRoutes from './routes/token.routes.js';
import aiRoutes from './routes/ai.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import userPreferenceRoutes from './routes/userPreference.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import securityLogRoutes from './routes/securityLog.routes.js';

const app = express();

// ─── Security: CORS ────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.clientUrl || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Security: HTTP headers ────────────────────────────────────────────────────
app.use(helmet());

// ─── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ─── Body Parsing ──────────────────────────────────────────────────────────────
// Note: multer handles its own parsing for multipart/form-data routes.
// These parsers only run on JSON / urlencoded requests.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Security: Sanitization ────────────────────────────────────────────────────
// 1. Strip MongoDB operator injection ($, .) from request body/params/query
app.use(mongoSanitizeMiddleware);
// 2. Strip XSS payloads from all string values
app.use(xssSanitize);

// ─── Static Files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static('uploads'));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Planify AI API running' });
});

// ─── API Rate Limiting ─────────────────────────────────────────────────────────
app.use('/api', apiLimiter);                // 200 req / 15 min per IP
app.use('/api/auth', authLimiter);          // 20  req / 15 min per IP (stricter)

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/study-sessions', studySessionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/preferences', userPreferenceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/security-logs', securityLogRoutes);

// ─── Error Handler (must be last) ─────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
