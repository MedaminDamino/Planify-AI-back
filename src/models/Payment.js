import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    type: {
      type: String,
      enum: ['subscription', 'token_pack'],
      required: true,
    },
    provider: {
      type: String,
      enum: ['demo', 'stripe', 'paymee', 'konnect', 'other'],
      default: 'demo',
    },
    providerPaymentId: String,
    tokenAmount: Number,
    description: String,
    paidAt: Date,
    invoiceNumber: String,
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ userId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });

export default mongoose.model('Payment', paymentSchema);
