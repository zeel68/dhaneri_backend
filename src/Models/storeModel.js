import mongoose from 'mongoose';
const { Schema } = mongoose;

// Store Theme Schema
const storeThemeSchema = new Schema({
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true,
        unique: true
    },
    colors: {
        type: String,
        default: "#4f46e5"
    },
    font_family: {
        type: String,
        default: "'Inter', sans-serif"
    },
    custom_css: String
}, {
    timestamps: false,
    versionKey: false
});

// Store Attribute Schema
const storeAttributeSchema = new Schema({
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    attribute_name: {
        type: String,
        required: true
    },
    attribute_value: {
        type: String,
        required: true
    }
}, {
    timestamps: false,
    versionKey: false
});

// Store Feature Schema
const storeFeatureSchema = new Schema({
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    feature_name: {
        type: String,
        required: true
    }
}, {
    timestamps: false,
    versionKey: false
});

// Store Schema
const storeSchema = new Schema({
    name: {
        type: String,
        required: true,
        index: true
    },
    users: {
        type: {
            email: String,
            password: String
        }
    },
    domain: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    category_id: {
        type: Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },
    config: {
        type: Schema.Types.Mixed,
        default: {}
    },
    is_active: {
        type: Boolean,
        default: true,
        index: true
    },
    // Embedded documents for better performance
    features: [{
        feature_name: String
    }],
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attributes: [{
        attribute_name: String,
        attribute_value: String
    }],
    theme: {
        type: {
            _id: {
                type: Schema.Types.ObjectId,
                default: new mongoose.Types.ObjectId()
            },
            primary_color: {
                type: String,
                default: "#4f46e5"
            },
            secondary_color: {
                type: String,
                default: "#f43f5e"
            },
            font_family: {
                type: String,
                default: "'Inter', sans-serif"
            },
            custom_css: String
        },
        default: {}
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for category details
storeSchema.virtual('category_details', {
    ref: 'Category',
    localField: 'category_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for products count
storeSchema.virtual('products_count', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'store_id',
    count: true
});

// Virtual for orders count
storeSchema.virtual('orders_count', {
    ref: 'Order',
    localField: '_id',
    foreignField: 'store_id',
    count: true
});

// Virtual for users count
storeSchema.virtual('users_count', {
    ref: 'User',
    localField: '_id',
    foreignField: 'store_id',
    count: true
});

// Indexes
// storeSchema.index({ name: 1 }); // Simple index on name
// storeSchema.index({ domain: 1 }, { unique: true }); // Unique index on domain
// storeSchema.index({ is_active: 1 }); // Index on is_active
// storeSchema.index({ category_id: 1 }); // Index on category_id
// storeSchema.index({ 'features.feature_name': 1 }); // Index on feature names
// storeSchema.index({ 'attributes.attribute_name': 1, 'attributes.attribute_value': 1 }); // Compound index on attributes

// Middleware to validate category exists
storeSchema.pre('save', async function (next) {
    if (this.isModified('category_id')) {
        const categoryExists = await mongoose.model('Category').exists({ _id: this.category_id });
        if (!categoryExists) {
            throw new Error('Specified category does not exist');
        }
    }
    next();
});

storeSchema.pre('deleteOne', async function (next) {
    const productCount = await mongoose.model('Product').countDocuments({ store_id: this._id });
    if (productCount > 0) throw new Error('Store has active products');
    next();
});

storeSchema.pre('deleteOne', async function (next) {
    await mongoose.model('StoreCategory').deleteMany({ store_id: this._id });
    next();
});

// Models
const StoreFeature = mongoose.models.StoreFeature || mongoose.model('StoreFeature', storeFeatureSchema);
const StoreAttribute = mongoose.models.StoreAttribute || mongoose.model('StoreAttribute', storeAttributeSchema);
const StoreTheme = mongoose.models.StoreTheme || mongoose.model('StoreTheme', storeThemeSchema);
const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);


export {
    Store,
    StoreFeature,
    StoreAttribute,
    StoreTheme
}
