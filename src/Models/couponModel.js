import mongoose from "mongoose"
const { Schema } = mongoose

const couponSchema = new Schema(
  {
    store_id: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: {
        values: ["percentage", "fixed", "free_shipping"],
        message: "Invalid coupon type",
      },
    },
    value: {
      type: Number,
      min: [0, "Value cannot be negative"],
    },
    minimum_order_amount: {
      type: Number,
      default: 0,
      min: [0, "Minimum order amount cannot be negative"],
    },
    maximum_discount_amount: {
      type: Number,
      min: [0, "Maximum discount amount cannot be negative"],
    },
    usage_limit: {
      type: Number,
      min: [1, "Usage limit must be at least 1"],
    },
    usage_count: {
      type: Number,
      default: 0,
      min: [0, "Usage count cannot be negative"],
    },
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      validate: {
        validator: function (value) {
          return !value || value > this.start_date
        },
        message: "End date must be after start date",
      },
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    applicable_products: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    applicable_categories: [
      {
        type: Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    versionKey: false,
  },
)

// Compound index for store and code uniqueness
couponSchema.index({ store_id: 1, code: 1 }, { unique: true })

// Virtual to check if coupon is currently valid
couponSchema.virtual("is_valid").get(function () {
  const now = new Date()
  const isDateValid = now >= this.start_date && (!this.end_date || now <= this.end_date)
  const isUsageValid = !this.usage_limit || this.usage_count < this.usage_limit
  return this.is_active && isDateValid && isUsageValid
})

// Method to check if coupon can be applied to an order
couponSchema.methods.canApplyToOrder = function (orderData) {
  if (!this.is_valid) return false

  // Check minimum order amount
  if (this.minimum_order_amount && orderData.subtotal < this.minimum_order_amount) {
    return false
  }

  // Check applicable products
  if (this.applicable_products && this.applicable_products.length > 0) {
    const orderProductIds = orderData.items.map((item) => item.product_id.toString())
    const hasApplicableProduct = this.applicable_products.some((productId) =>
      orderProductIds.includes(productId.toString()),
    )
    if (!hasApplicableProduct) return false
  }

  // Check applicable categories
  if (this.applicable_categories && this.applicable_categories.length > 0) {
    // This would need product category information in the order data
    // Implementation depends on your order structure
  }

  return true
}

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function (orderSubtotal) {
  let discount = 0

  switch (this.type) {
    case "percentage":
      discount = (orderSubtotal * this.value) / 100
      break
    case "fixed":
      discount = this.value
      break
    case "free_shipping":
      // This would be handled in shipping calculation
      discount = 0
      break
  }

  // Apply maximum discount limit
  if (this.maximum_discount_amount && discount > this.maximum_discount_amount) {
    discount = this.maximum_discount_amount
  }

  // Ensure discount doesn't exceed order subtotal
  return Math.min(discount, orderSubtotal)
}

export const Coupon = mongoose.model("Coupon", couponSchema)
