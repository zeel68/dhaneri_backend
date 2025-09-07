import mongoose from "mongoose"
const { Schema } = mongoose

const cartEventSchema = new Schema(
  {
    store_id: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    session_id: {
      type: String,
      default: null,
      index: true,
    },
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variant_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      default: null,
    },
    size_id: {
      type: Schema.Types.ObjectId,
      ref: "ProductSize",
      default: null,
    },
    action: {
      type: String,
      enum: ["add", "remove", "update", "abandon"],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    total_value: {
      type: Number,
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
    cart_total_before: {
      type: Number,
      default: 0,
    },
    cart_total_after: {
      type: Number,
      default: 0,
    },
    cart_items_count: {
      type: Number,
      default: 0,
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
cartEventSchema.index({ store_id: 1, created_at: -1 })
cartEventSchema.index({ product_id: 1, action: 1 })
cartEventSchema.index({ user_id: 1, created_at: -1 })
// cartEventSchema.index({ session_id: 1 })
cartEventSchema.index({ action: 1, created_at: -1 })

export const CartEvent = mongoose.model("CartEvent", cartEventSchema)
