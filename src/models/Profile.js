import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    bio: String,
    location: String,
    phone: String,
    university: String,
    program: String,
    fieldOfStudy: String,
    academicYear: String,
    studentId: String,
    gpa: String,
    tags: [String],
    // Account Recovery fields
    recoveryEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    recoveryEmailVerified: {
      type: Boolean,
      default: false,
    },
    recoveryPhone: {
      type: String,
      trim: true,
    },
    recoveryPhoneVerified: {
      type: Boolean,
      default: false,
    },
    backupCodesCount: {
      type: Number,
      default: 0,
    },
    profileCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    socialLinks: {
      website: String,
      linkedin: String,
      github: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Profile', profileSchema);
