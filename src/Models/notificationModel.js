import mongoose from 'mongoose';
const { Schema } = mongoose;
  
const notificationSchema = new Schema(
    {
        user_id: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            index: true,
        },
        type: {
            type: String,
            required: true,
            enum: ["order", "payment", "shipping", "promotion", "system", "review", "inventory"],
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        message: {
            type: String,
            required: true,
        },
        data: Schema.Types.Mixed,
        channels: [
            {
                type: String,
                enum: ["email", "sms", "push", "in_app"],
            },
        ],
        status: {
            type: String,
            required: true,
            default: "pending",
            enum: ["pending", "sent", "delivered", "failed", "read"],
            index: true,
        },
        priority: {
            type: String,
            required: true,
            default: "medium",
            enum: ["low", "medium", "high", "urgent"],
        },
        scheduled_at: Date,
        sent_at: Date,
        read_at: Date,
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
        versionKey: false,
    },
)

export const Notification = mongoose.model("Notification", notificationSchema)
