import { config } from 'dotenv';
import mongoose from 'mongoose';
const { Schema } = mongoose;
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

const categorySchema = new Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        unique: [true, 'Category name must be unique'],
        trim: true,
        minlength: [2, 'Category name must be at least 2 characters'],
        maxlength: [100, 'Category name cannot exceed 100 characters'],
        index: true
    },
    slug: String,
    image_url: String,
    config: configSchema,
    // Tags configuration per category
    tag_schema: [{
        type: Schema.Types.ObjectId,
        ref: 'Tag'
    }],
    is_active: Boolean,
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for stores using this category
categorySchema.virtual('stores', {
    ref: 'Store',
    localField: '_id',
    foreignField: 'category_id'
});

// Update timestamp on save
categorySchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

// Prevent deletion if used by stores
categorySchema.pre('deleteOne', { document: true }, async function (next) {
    const storeCount = await mongoose.model('Store').countDocuments({ category_id: this._id });
    if (storeCount > 0) {
        throw new Error('Cannot delete category used by stores');
    }
    next();
});

export const Category = mongoose.model('Category', categorySchema);
