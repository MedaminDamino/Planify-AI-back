import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

// ─── General API rate limiter ──────────────────────────────────────────────────
// 200 requests per 15 minutes per IP across all /api routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

// ─── Auth rate limiter ─────────────────────────────────────────────────────────
// Dev: 100 attempts per 15 min (won't block repeated test logins)
// Prod: 20 attempts per 15 min (brute-force protection)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again in 15 minutes.',
  },
});
