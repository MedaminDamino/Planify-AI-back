import mongoose from 'mongoose';

/**
 * UserSession — tracks one active JWT login session per device.
 *
 * Created on login, deactivated on logout or explicit revoke.
 * TTL index automatically removes expired documents so the collection
 * stays clean without a cron job.
 *
 * We never store the raw JWT; we store a sha256 fingerprint so the
 * document can be matched at the middleware level if needed in future.
 */
const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenId: { type: String },
    // Derived from User-Agent at login time — never stored raw for privacy
    device: { type: String, default: 'Unknown Device' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    // 'desktop' | 'laptop' | 'mobile' | 'tablet' | 'other'
    deviceType: {
      type: String,
      enum: ['desktop', 'laptop', 'mobile', 'tablet', 'other'],
      default: 'other',
    },
    ipAddress: { type: String, default: '' },
    location: { type: String, default: '' },
    userAgent: { type: String, select: false }, // stored but not returned by default
    deviceId: { type: String, default: '' },
    fingerprint: { type: String, default: '' },
    isCurrent: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isRevoked: { type: Boolean, default: false },
    lastActivity: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast per-user queries
userSessionSchema.index({ userId: 1, isActive: 1 });
userSessionSchema.index({ userId: 1, isCurrent: 1 });
userSessionSchema.index({ userId: 1, fingerprint: 1 });

// TTL index — MongoDB auto-removes expired sessions (no cron needed)
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('UserSession', userSessionSchema);
