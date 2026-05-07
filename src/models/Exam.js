import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
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
    examDate: {
      type: Date,
      required: true,
    },
    startTime: String,
    endTime: String,
    location: String,
    type: {
      type: String,
      enum: ['exam', 'quiz', 'test', 'tp', 'td', 'presentation', 'other'],
      default: 'exam',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    revisionProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ['upcoming', 'completed', 'missed'],
      default: 'upcoming',
    },
    topics: [String],
    notes: String,
    aiPreparationPlan: String,
  },
  {
    timestamps: true,
  }
);

examSchema.index({ userId: 1 });
examSchema.index({ courseId: 1 });
examSchema.index({ examDate: 1 });

export default mongoose.model('Exam', examSchema);
