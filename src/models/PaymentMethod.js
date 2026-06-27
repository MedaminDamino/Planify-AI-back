import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stripePaymentMethodId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCustomerId: {
      type: String,
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
    last4: {
      type: String,
    },
    expMonth: {
      type: Number,
    },
    expYear: {
      type: Number,
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
