import rateLimit from 'express-rate-limit';

// ─── General API rate limiter ──────────────────────────────────────────────────
// 200 requests per 15 minutes per IP across all /api routes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

// ─── Auth rate limiter ─────────────────────────────────────────────────────────
// 20 requests per 15 minutes per IP — protects register/login from brute force
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again in 15 minutes.',
  },
});
