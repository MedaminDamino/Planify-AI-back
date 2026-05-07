import mongoose from 'mongoose';

const aiRequestSchema = new mongoose.Schema(
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
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    type: {
      type: String,
      enum: ['daily_plan', 'summary', 'exercises', 'chat', 'priority', 'flashcards', 'exam_prep'],
      required: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    response: String,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    tokensUsed: {
      type: Number,
      default: 0,
    },
    internalTokensCost: {
      type: Number,
      default: 0,
    },
    model: String,
    errorMessage: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

aiRequestSchema.index({ userId: 1 });
aiRequestSchema.index({ type: 1 });
aiRequestSchema.index({ createdAt: 1 });

export default mongoose.model('AIRequest', aiRequestSchema);
