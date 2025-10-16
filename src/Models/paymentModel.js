// Payment.js
import mongoose from "mongoose";
const paymentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    store_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    order_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: String,
    // paymentMethod: {
    //     type: mongoose.Schema.Types.ObjectId,
    //     ref: 'PaymentMethod',
    //     required: true
    // },
    payment_provider: String,
    payment_method: {
        type: String
    },
    gateway_data: {
        type: JSON
    },
    gateway_response: String,

    transaction_id: String,
    processed_at: Date,
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
