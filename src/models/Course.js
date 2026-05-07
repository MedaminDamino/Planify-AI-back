import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    semester: String,
    teacher: String,
    room: String,
    color: {
      type: String,
      default: '#4f46e5',
    },
    icon: String,
    status: {
      type: String,
      enum: ['active', 'archived', 'completed'],
      default: 'active',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tags: [String],
    totalFiles: {
      type: Number,
      default: 0,
    },
    totalTasks: {
      type: Number,
      default: 0,
    },
    totalExams: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

courseSchema.index({ userId: 1 });
courseSchema.index({ userId: 1, status: 1 });

export default mongoose.model('Course', courseSchema);
