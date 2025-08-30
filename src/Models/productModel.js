
import mongoose, { mongo } from "mongoose";
const { Schema } = mongoose;

export const StoreCategory = {
    JEWELRY: 'Jewelry',
    FASHION: 'Fashion',
    TOYS: 'Toys',
    ELECTRONICS: 'Electronics',
    HOME_DECOR: 'Home_decor',
    BOOKS: 'Books',
    SPORTS: 'Sports',
    BEAUTY: 'Beauty',
    HOME: 'Home',
    GENERAL: 'General'
};
const productSizes = new mongoose.Schema({
    id: { type: String },
    size: { type: String },
    stock: { type: Number },
    priceModifier: { type: Number },
    sku: { type: String },
    attributes: { type: Map, of: String },
},)

const productVariant = new mongoose.Schema({
    id: { type: String },
    color: { type: String },
    images: [String],
    primaryIndex: { type: Number },
    sizes: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductSizes"
        }
    ],
    option: { type: String },
    price: { type: Number },
    sku: { type: String },
    stock_quantity: { type: Number },
},)

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Product name can't be empty"],
    },
    description: {
        type: String,
    },
    price: {
        type: Number,
    },
    parent_category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category', // Changed from 'StoreCategory'
    },
    store_id: {
        type: Schema.Types.ObjectId,
        ref: "Store",
        required: true,
    },
    slug: {
        type: String,
        required: true,
    },
    compare_price: {
        type: Number,
    },
    HSNCode: {
        type: String,
    },
    GST: {
        type: Number,
    },
    sku: {
        type: String,
    },
    brand: {
        type: String,
    },

    reviews: [
        {
            status: {
                type: String,
                enum: ['pending', 'published', 'hidden', 'approved'],
                default: 'published',
            },
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            rating: {
                type: Number,
                default: 0,
            },
            comment: String,
            date: {
                type: Date,
                default: Date.now,
            },
        },
    ],

    // Embedded variants
    variants: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductVariant"
        }
    ],

    // Simplified attributes (as in your document)
    attributes: {
        color: [String],
        size: [String],
    },

    stock: {
        quantity: {
            type: Number,
            default: 0,
            required: [true, "Quantity is required"],
        },
        reserved: {
            type: Number,
            default: 0,
        },
        track_inventory: {
            type: Boolean,
            default: true,
        },
        low_stock_threshold: {
            type: Number,
            default: 0,
        },
        allow_backorder: {
            type: Boolean,
            default: false,
        },
    },

    images: [String],

    is_active: {
        type: Boolean,
        default: true,
    },

    tags: [
        {
            tagId: { type: Schema.Types.ObjectId, ref: 'Tag' },
            tagName: String,
            tagType: String,
            value: Schema.Types.Mixed,
            category: String, // StoreCategory enum value
        },
    ],

    ratings: {
        average: {
            type: Number,
            default: 0,
        },
        count: {
            type: Number,
            default: 0,
        },
    },

    availableTags: [String],

    searchFilters: Schema.Types.Mixed,

    displaySettings: Schema.Types.Mixed,
}, {
    timestamps: true,
});

// Pre-save hook to compute average rating
productSchema.pre('save', async function (next) {
    try {
        const totalRatings = this.reviews.length;
        const totalRatingSum = this.reviews.reduce((sum, review) => sum + review.rating, 0);
        this.ratings.average = totalRatings > 0 ? totalRatingSum / totalRatings : 0;
        this.ratings.count = totalRatings;
        next();
    } catch (error) {
        next(error);
    }
});

// Indexes for performance
productSchema.index({ 'tags.tagId': 1 });
productSchema.index({ 'tags.category': 1 });
productSchema.index({ storeCategory: 1, 'tags.tagType': 1 });
productSchema.index({ store_id: 1, storeCategory: 1 });
productSchema.index({ 'tags.value': 1 });

// Post-save hook to update category's product count
productSchema.post('save', async function (doc, next) {
    try {
        const Category = mongoose.model('Category');
        await Category.findByIdAndUpdate(doc.category, { $inc: { productCount: 1 } });
        next();
    } catch (error) {
        next(error);
    }
});
export const ProductSizes = mongoose.model('ProductSizes', productSizes)
export const ProductVariant = mongoose.model('ProductVariant', productVariant);
export const Product = mongoose.model('Product', productSchema);
