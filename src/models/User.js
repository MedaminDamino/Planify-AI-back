import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student',
    },
    avatar: String,
    plan: {
      type: String,
      enum: ['free', 'student', 'pro'],
      default: 'free',
    },
    tokenBalance: {
      type: Number,
      default: 10000,
    },
    trialStartedAt: {
      type: Date,
      default: Date.now,
    },
    trialEndsAt: Date,
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    emailVerificationToken: String,
    emailVerificationExpires: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
