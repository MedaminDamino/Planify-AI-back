import mongoose from 'mongoose';

const securityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: [
        'login',
        'logout',
        'failed_login',
        'password_change',
        'profile_update',
        'token_purchase',
        'security_update',
      ],
      required: true,
    },
    ipAddress: String,
    userAgent: String,
    device: String,
    location: String,
    status: {
      type: String,
      enum: ['success', 'failed'],
      default: 'success',
    },
    details: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

securityLogSchema.index({ userId: 1 });
securityLogSchema.index({ action: 1 });
securityLogSchema.index({ createdAt: 1 });

export default mongoose.model('SecurityLog', securityLogSchema);
