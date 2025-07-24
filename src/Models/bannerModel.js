import mongoose from "mongoose";
const {Schema} = mongoose;

const bannerSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        subtitle: String,
        image_url: {
            type: String,
            required: true,
        },
        mobile_image_url: String,
        link_url: String,
        link_text: String,
        position: {
            type: String,
            required: true,
            enum: ["hero", "category", "product", "footer", "popup"],
        },
        display_order: {
            type: Number,
            default: 0,
        },
        target_audience: {
            user_roles: [String],
            new_users_only: Boolean,
            returning_users_only: Boolean,
        },
        schedule: {
            start_date: {
                type: Date,
                required: true,
            },
            end_date: Date,
            is_always_active: {
                type: Boolean,
                default: false,
            },
        },
        styling: {
            background_color: String,
            text_color: String,
            button_color: String,
            overlay_opacity: {
                type: Number,
                min: 0,
                max: 1,
            },
        },
        analytics: {
            impressions: {
                type: Number,
                default: 0,
            },
            clicks: {
                type: Number,
                default: 0,
            },
            conversion_rate: {
                type: Number,
                default: 0,
            },
        },
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

export const Banner = mongoose.model("Banner", bannerSchema)
