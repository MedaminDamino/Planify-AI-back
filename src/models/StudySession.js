import mongoose from 'mongoose';

const studySessionSchema = new mongoose.Schema(
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
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: Date,
    endTime: Date,
    duration: Number,
    focusScore: Number,
    status: {
      type: String,
      enum: ['planned', 'active', 'completed', 'cancelled'],
      default: 'planned',
    },
    notes: String,
    aiSuggested: {
      type: Boolean,
      default: false,
    },
    completedTasks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    breakDuration: Number,
    productivityRating: Number,
  },
  {
    timestamps: true,
  }
);

studySessionSchema.index({ userId: 1 });
studySessionSchema.index({ courseId: 1 });
studySessionSchema.index({ startTime: 1 });
studySessionSchema.index({ status: 1 });

export default mongoose.model('StudySession', studySessionSchema);
