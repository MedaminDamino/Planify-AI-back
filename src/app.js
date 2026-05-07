import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorMiddleware } from './middlewares/error.middleware.js';

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

// ─── Core Middlewares ──────────────────────────────────────────────────────────
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ──────────────────────────────────────────────────────────────
app.use('/uploads', express.static('uploads'));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: 'Planify AI API running' });
});

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
