import mongoose from 'mongoose';
const { Schema } = mongoose;

// Order Item Schema
const orderItemSchema = new Schema({
    product_id: {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    variant_id: {
        type: Schema.Types.ObjectId,
        ref: 'ProductVariant',
        index: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price cannot be negative']
    },
    attributes: {
        type: Schema.Types.Mixed,
        default: {}
    },
    product_name: {  // Snapshot of product name at time of order
        type: String,
    },
    variant_name: {  // Snapshot of variant name at time of order
        type: String
    },
    image_url: {  // Snapshot of product image at time of order
        type: String
    }
}, {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for current product details
orderItemSchema.virtual('product_details', {
    ref: 'Product',
    localField: 'product_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for current variant details
orderItemSchema.virtual('variant_details', {
    ref: 'ProductVariant',
    localField: 'variant_id',
    foreignField: '_id',
    justOne: true
});

// Order Schema
const orderSchema = new Schema({
    store_id: {
        type: Schema.Types.ObjectId,
        ref: 'Store',
        required: true,
        index: true
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    order_number: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    total: {
        type: Number,
        required: true,
        min: [0, 'Total cannot be negative']
    },
    status: {
        type: String,
        required: true,
        default: 'pending',
        index: true,
        enum: {
            values: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
            message: 'Invalid order status'
        }
    },
    shipping_address: {
        type: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            postal_code: { type: String, required: true },
            phone: { type: String, required: true }
        },
        required: true
    },
    billing_address: {
        type: {
            street: String,
            city: String,
            state: String,
            country: String,
            postal_code: String
        },
        default: null
    },
    items: [orderItemSchema], // Embedded order items
    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    shipping_method: String,
    tracking_number: String,
    notes: String
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for store details
orderSchema.virtual('store_details', {
    ref: 'Store',
    localField: 'store_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for user details
orderSchema.virtual('user_details', {
    ref: 'User',
    localField: 'user_id',
    foreignField: '_id',
    justOne: true
});

// Virtual for payment details
orderSchema.virtual('payment_info', {
    ref: 'Payment',
    localField: '_id',
    foreignField: 'order_id',
    justOne: true
});

// Calculate total items in order (virtual)
orderSchema.virtual('items_count').get(function () {
    if (!Array.isArray(this.items)) return 0;
    return this.items.reduce((count, item) => count + item.quantity, 0);
});

// Indexes
orderSchema.index({ store_id: 1, status: 1 });
orderSchema.index({ user_id: 1, created_at: -1 });
orderSchema.index({ 'shipping_address.country': 1 });
orderSchema.index({ created_at: -1 });

// Middleware to validate references
orderSchema.pre('save', async function (next) {
    // Validate store exists
    const storeExists = await mongoose.model('Store').exists({ _id: this.store_id });
    if (!storeExists) throw new Error('Specified store does not exist');

    // Validate user exists
    const userExists = await mongoose.model('User').exists({ _id: this.user_id });
    if (!userExists) throw new Error('Specified user does not exist');

    // Validate order items
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

orderSchema.index({
    store_id: 1,
    status: 1,
    created_at: -1
});

// Generate order number if not provided
orderSchema.pre('save', function (next) {
    if (!this.order_number) {
        this.order_number = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    next();
});

// Static method to get orders by status
orderSchema.statics.findByStatus = function (status, options = {}) {
    return this.find({ status })
        .sort({ created_at: -1 })
        .limit(options.limit || 100)
        .skip(options.skip || 0)
        .populate(options.populate || []);
};

// Model
const Order = mongoose.model('Order', orderSchema);
const OrderItem = mongoose.model('OrderItem', orderItemSchema);

export { Order, OrderItem };
