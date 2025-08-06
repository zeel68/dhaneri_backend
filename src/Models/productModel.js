import mongoose from "mongoose";
const { Schema } = mongoose

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

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "product name can't be empty"],
    },
    description: String,
    price: {
        type: Number,
        required: [true, "product price can't be null or zero"],
    },
    parent_category: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StoreCategory',
    },
    store_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Store",
        required: true
    },
    reviews: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            rating: {
                type: Number,
                default: 0
            },
            comment: String,
            date: {
                type: Date,
                default: Date.now
            }
        }
    ],
    attributes: {
        color: {
            type: [
                {
                    colorOption: {
                        type: String,
                    },
                    isSelected: {
                        type: Boolean,
                        default: false
                    }
                }
            ]
        },
        size: {
            type: [
                {
                    colorOption: {
                        type: Number,
                    },
                    isSelected: {
                        type: Boolean,
                        default: false
                    }
                }
            ]
        },

    },
    stock: {
        quantity: {
            type: Number,
            default: 0,
            required: [true, "Quantity is required"]
        },
        reserved: {
            type: Number,
            default: 0
        }
    },
    images: [String],
    is_active: {
        type: Boolean,
        default: true
    },
    tags: [{
        tagId: { type: Schema.Types.ObjectId, ref: 'Tag' },
        tagName: String,
        tagType: String,
        value: Schema.Types.Mixed,
        category: String // StoreCategory enum value
    }],

    ratings: {
        average: {
            type: Number,
            default: 0
        },
        count: {
            type: Number,
            default: 0
        }
    },
    availableTags: [String],
    searchFilters: Schema.Types.Mixed,
    displaySettings: Schema.Types.Mixed
});
productSchema.pre('save', async function (next) {
    try {
        // Calculate average rating
        const totalRatings = this.reviews.length;
        const totalRatingSum = this.reviews.reduce((sum, review) => sum + review.rating, 0);
        this.ratings.average = totalRatings > 0 ? totalRatingSum / totalRatings : 0;

        // Update total ratings count
        this.ratings.count = totalRatings;

        next();
    } catch (error) {
        next(error);
    }
});
// Add to product schema
productSchema.index({ 'tags.tagId': 1 });
productSchema.index({ 'tags.category': 1 });
productSchema.index({ storeCategory: 1, 'tags.tagType': 1 });
productSchema.index({ store_id: 1, storeCategory: 1 });
productSchema.index({ 'tags.value': 1 });

// Post-save middleware to update category's product count
productSchema.post('save', async function (doc, next) {
    try {

        const Category = mongoose.model('Category');
        await Category.findByIdAndUpdate(doc.category, { $inc: { productCount: 1 } });
        next();
    } catch (error) {
        next(error);
    }
});




// Add to product.model.ts
const productVariantSchema = new Schema({
    product_id: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    attributes: {  // e.g., { color: "Red", size: "XL" }
        type: Map,
        of: String
    },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 }
}, { timestamps: true });


export const ProductVariant = mongoose.model('ProductVariant', productVariantSchema);
export const Product = mongoose.model('Product', productSchema);
