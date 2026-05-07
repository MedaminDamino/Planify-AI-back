import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'review', 'completed'],
      default: 'todo',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    deadline: Date,
    estimatedDuration: Number,
    actualDuration: Number,
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    aiSuggested: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ['manual', 'ai', 'imported'],
      default: 'manual',
    },
    completedAt: Date,
    tags: [String],
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ userId: 1 });
taskSchema.index({ courseId: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ deadline: 1 });

export default mongoose.model('Task', taskSchema);
