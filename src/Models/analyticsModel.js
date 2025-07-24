import mongoose from "mongoose";
const {Schema} = mongoose;
const analyticsSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
        metrics: {
            visitors: {
                unique: { type: Number, default: 0 },
                total: { type: Number, default: 0 },
                returning: { type: Number, default: 0 },
                new: { type: Number, default: 0 },
            },
            sales: {
                orders: { type: Number, default: 0 },
                revenue: { type: Number, default: 0 },
                average_order_value: { type: Number, default: 0 },
                conversion_rate: { type: Number, default: 0 },
            },
            products: {
                views: { type: Number, default: 0 },
                searches: { type: Number, default: 0 },
                cart_additions: { type: Number, default: 0 },
                purchases: { type: Number, default: 0 },
            },
            traffic_sources: {
                direct: { type: Number, default: 0 },
                search: { type: Number, default: 0 },
                social: { type: Number, default: 0 },
                referral: { type: Number, default: 0 },
                email: { type: Number, default: 0 },
            },
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
        versionKey: false,
    },
)

// Compound index for store and date uniqueness
analyticsSchema.index({ store_id: 1, date: 1 }, { unique: true })

export const Analytics = mongoose.model("Analytics", analyticsSchema)
