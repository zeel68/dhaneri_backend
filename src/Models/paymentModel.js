// Payment.js
import mongoose from "mongoose";
const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    // paymentMethod: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'PaymentMethod',
    //     required: true
    // },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled', 'processing', 'paid'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export const Payment = mongoose.model('Payment', paymentSchema);
