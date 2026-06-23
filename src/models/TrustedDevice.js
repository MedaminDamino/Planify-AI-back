import mongoose from 'mongoose';

const trustedDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // 'desktop' | 'laptop' | 'mobile' | 'tablet' | 'other'
    deviceType: {
      type: String,
      enum: ['desktop', 'laptop', 'mobile', 'tablet', 'other'],
      default: 'other',
    },
    userAgent: String,
    ipAddress: String,
    isCurrent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt used as "added on" date
  }
);

trustedDeviceSchema.index({ userId: 1 });

export default mongoose.model('TrustedDevice', trustedDeviceSchema);
