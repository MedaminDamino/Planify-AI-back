import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    brand: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    expiry: {
      type: String,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('PaymentMethod', paymentMethodSchema);
