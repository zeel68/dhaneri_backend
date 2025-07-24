import mongoose from "mongoose"
const { Schema } = mongoose

const wishlistEventSchema = new Schema(
  {
    store_id: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["add", "remove"],
      required: true,
    },
    ip_address: {
      type: String,
      required: true,
    },
    user_agent: {
      type: String,
      required: true,
    },
    location: {
      country: String,
      country_code: String,
      region: String,
      city: String,
      latitude: Number,
      longitude: Number,
    },
    device_info: {
      type: {
        type: String,
        enum: ["desktop", "mobile", "tablet"],
        default: "desktop",
      },
      browser: String,
      os: String,
    },
    referrer: {
      type: String,
      default: null,
    },
    utm_params: {
      source: String,
      medium: String,
      campaign: String,
      term: String,
      content: String,
    },
    conversion_data: {
      days_to_purchase: Number,
      purchased: {
        type: Boolean,
        default: false,
      },
      purchase_date: Date,
      purchase_value: Number,
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

// Indexes
wishlistEventSchema.index({ store_id: 1, created_at: -1 })
wishlistEventSchema.index({ user_id: 1, created_at: -1 })
wishlistEventSchema.index({ product_id: 1, action: 1 })
wishlistEventSchema.index({ action: 1, created_at: -1 })

export const WishlistEvent = mongoose.model("WishlistEvent", wishlistEventSchema)
