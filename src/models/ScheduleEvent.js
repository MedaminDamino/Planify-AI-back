import mongoose from 'mongoose';

const scheduleEventSchema = new mongoose.Schema(
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
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    type: {
      type: String,
      enum: ['course', 'td', 'tp', 'exam', 'study_session', 'task', 'break', 'personal', 'other'],
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    location: String,
    color: String,
    recurrence: {
      enabled: {
        type: Boolean,
        default: false,
      },
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'none'],
        default: 'none',
      },
      daysOfWeek: [String],
      until: Date,
    },
    aiSuggested: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
    },
  },
  {
    timestamps: true,
  }
);

scheduleEventSchema.index({ userId: 1 });
scheduleEventSchema.index({ start: 1 });
scheduleEventSchema.index({ end: 1 });
scheduleEventSchema.index({ type: 1 });

export default mongoose.model('ScheduleEvent', scheduleEventSchema);
