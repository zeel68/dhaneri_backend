import mongoose from "mongoose"
const { Schema } = mongoose
const attributeSchema = new Schema(
    {
        name: String,
        type: String,
        is_required: Boolean,
        default_value: String,
    },
    { _id: false }
);

const filterSchema = new Schema(
    {
        name: String,
        type: {
            type: String,
            enum: ["text", "number", "range", "select", "multiselect", "boolean"],
        },
        options: [String],
        is_required: Boolean,
    },
    { _id: false }
);

const configSchema = new Schema(
    {
        filters: [filterSchema],
        attributes: [attributeSchema],
    },
    { _id: false }
);

const storeCategorySchema = new Schema(
    {
        category_id: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
            required: true,
        },
        is_primary: {
            type: Boolean,
            default: false,
        },
        products: [
            {
                type: Schema.Types.ObjectId,
                ref: "Product",
            },
        ],
        img_url : {
            type:String
        },
        display_name: {
            type: String,
            required: true,
        },
        description: String,
        sort_order: {
            type: Number,
            default: 0,
        },
        is_active: {
            type: Boolean,
            default: true,
        },
        config: configSchema, // ✅ now nested properly
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Indexes
storeCategorySchema.index({ store_id: 1, category_id: 1 },)
storeCategorySchema.index({ store_id: 1, is_primary: 1 })

export const StoreCategoryModel = mongoose.model("StoreCategory", storeCategorySchema)
