import mongoose from 'mongoose';
const { Schema } = mongoose;

const shippingMethodSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: String,
        type: {
            type: String,
            required: true,
            enum: ["standard", "express", "overnight", "same_day", "pickup"],
        },
        base_cost: {
            type: Number,
            required: true,
            min: 0,
        },
        cost_per_kg: {
            type: Number,
            min: 0,
        },
        cost_per_km: {
            type: Number,
            min: 0,
        },
        free_shipping_threshold: {
            type: Number,
            min: 0,
        },
        estimated_days: {
            min: {
                type: Number,
                required: true,
                min: 0,
            },
            max: {
                type: Number,
                required: true,
                min: 0,
            },
        },
        zones: [String],
        is_active: {
            type: Boolean,
            default: true,
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

const shippingSchema = new Schema(
    {
        order_id: {
            type: Schema.Types.ObjectId,
            ref: "Order",
            required: true,
            index: true,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true,
        },
        shipping_method_id: {
            type: Schema.Types.ObjectId,
            ref: "ShippingMethod",
            required: true,
        },
        tracking_number: {
            type: String,
            index: true,
        },
        carrier: {
            type: String,
            required: true,
        },
        shipping_address: {
            name: { type: String, required: true },
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            postal_code: { type: String, required: true },
            phone: { type: String, required: true },
        },
        status: {
            type: String,
            required: true,
            default: "pending",
            enum: ["pending", "processing", "shipped", "in_transit", "delivered", "returned", "cancelled"],
            index: true,
        },
        cost: {
            type: Number,
            required: true,
            min: 0,
        },
        weight: Number,
        dimensions: {
            length: Number,
            width: Number,
            height: Number,
        },
        tracking_events: [
            {
                status: String,
                description: String,
                location: String,
                timestamp: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        shipped_at: Date,
        delivered_at: Date,
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
        versionKey: false,
    },
)

export const ShippingMethod = mongoose.model("ShippingMethod", shippingMethodSchema)
export const Shipping = mongoose.model("Shipping", shippingSchema)
