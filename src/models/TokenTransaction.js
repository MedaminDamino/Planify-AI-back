import mongoose from 'mongoose';

const tokenTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['bonus', 'purchase', 'usage', 'refund', 'admin_adjustment'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    aiRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AIRequest',
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

tokenTransactionSchema.index({ userId: 1 });
tokenTransactionSchema.index({ type: 1 });
tokenTransactionSchema.index({ createdAt: 1 });

export default mongoose.model('TokenTransaction', tokenTransactionSchema);
