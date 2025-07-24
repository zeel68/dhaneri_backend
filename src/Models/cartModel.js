import mongoose from 'mongoose';
const { Schema } = mongoose;

// Cart Item Schema
const cartItemSchema = new Schema({
    product_id: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    variant_id: {
        type: Schema.Types.ObjectId,
        ref: 'ProductVariant'
    },
    quantity: {
        type: Number,
        required: true,
        default: 1,
        min: [1, 'Quantity cannot be less than 1']
    },
    price_at_addition: {  // Recommended to store price snapshot
        type: Number,
        required: true
    },
    added_at: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: {
        updatedAt: 'updated_at',
        createdAt: false // We're using added_at instead
    },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for product details
cartItemSchema.virtual('product_details', {
    ref: 'Product',
    localField: 'product_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for variant details
cartItemSchema.virtual('variant_details', {
    ref: 'ProductVariant',
    localField: 'variant_id',
    foreignField: '_id',
    justOne: true
});

// Cart Schema
const cartSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        unique: true,
    },
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true,
        index: true
    },
    items: [cartItemSchema], // Embedded cart items
    expires_at: {  // Recommended for cart expiration
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
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

// Virtual for user details
cartSchema.virtual('user_details', {
    ref: 'User',
    localField: 'user_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for store details
cartSchema.virtual('store_details', {
    ref: 'Store',
    localField: 'store_id',
    foreignField: '_id',
    justOne: true
});

// Calculate cart total (virtual)
cartSchema.virtual('total').get(function () {
    return this.items.reduce((sum, item) => {
        return sum + (item.price_at_addition * item.quantity);
    }, 0);
});

// Calculate items count (virtual)
cartSchema.virtual('items_count').get(function () {
    return this.items.reduce((count, item) => count + item.quantity, 0);
});

// Indexes
cartItemSchema.index({ cart_id: 1 });
// cartItemSchema.index({ product_id: 1 });
cartItemSchema.index({ variant_id: 1 });

// Middleware to validate references
cartSchema.pre('save', async function (next) {
    if (this.isModified('user_id')) {
        const userExists = await mongoose.model('User').exists({ _id: this.user_id });
        if (!userExists) throw new Error('Specified user does not exist');
    }

    if (this.isModified('store_id')) {
        const storeExists = await mongoose.model('Store').exists({ _id: this.store_id });
        if (!storeExists) throw new Error('Specified store does not exist');
    }

    // Validate items before saving
    for (const item of this.items) {
        const productExists = await mongoose.model('Product').exists({ _id: item.product_id });
        if (!productExists) throw new Error(`Product ${item.product_id} does not exist`);

        if (item.variant_id) {
            const variantExists = await mongoose.model('ProductVariant').exists({
                _id: item.variant_id,
                product_id: item.product_id
            });
            if (!variantExists) throw new Error(`Variant ${item.variant_id} does not exist for product ${item.product_id}`);
        }
    }

    next();
});

// // Update product price when adding to cart
// cartSchema.methods.addItem = async function (productId, variantId, quantity = 1) {
//     const Product = mongoose.model('Product');
//     const product = await Product.findById(productId);

//     if (!product) throw new Error('Product not found');

//     const price = variantId
//         ? product.variants.id(variantId).price
//         : product.price;

//     this.items.push({
//         product_id: productId,
//         variant_id: variantId,
//         quantity,
//         price_at_addition: price
//     });

//     return this.save();
// };

// Models
cartSchema.methods.calculateTotals = function () {
    let total = 0;
    let itemsCount = 0;

    for (const item of this.items) {
        total += item.price_at_addition * item.quantity;
        itemsCount += item.quantity;
    }

    this.total_amount = total;
    this.items_count_value = itemsCount;
};
const Cart = mongoose.model('Cart', cartSchema);
const CartItem = mongoose.model('CartItem', cartItemSchema);

export { Cart, CartItem };
