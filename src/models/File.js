import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
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
    originalName: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    extension: String,
    size: Number,
    path: {
      type: String,
      required: true,
    },
    url: String,
    storageProvider: {
      type: String,
      enum: ['local', 'cloudinary', 's3'],
      default: 'local',
    },
    type: {
      type: String,
      enum: ['pdf', 'docx', 'xlsx', 'image', 'pptx', 'other'],
      default: 'other',
    },
    tags: [String],
    description: String,
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'processed', 'failed'],
      default: 'uploaded',
    },
    extractedText: String,
    aiSummary: String,
    keyPoints: [String],
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

fileSchema.index({ userId: 1 });
fileSchema.index({ courseId: 1 });
fileSchema.index({ type: 1 });

export default mongoose.model('File', fileSchema);
