import mongoose from "mongoose"
const { Schema } = mongoose

const productViewSchema = new Schema(
  {
    product_id: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    store_id: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
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
    view_duration: {
      type: Number,
      default: 0, // in seconds
    },
    scroll_depth: {
      type: Number,
      default: 0, // percentage
    },
    interactions: [
      {
        type: {
          type: String,
          enum: ["image_click", "zoom", "variant_select", "add_to_cart", "add_to_wishlist"],
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        data: Schema.Types.Mixed,
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

// Indexes
productViewSchema.index({ product_id: 1, created_at: -1 })
productViewSchema.index({ store_id: 1, created_at: -1 })
productViewSchema.index({ user_id: 1, created_at: -1 })
productViewSchema.index({ session_id: 1 })
productViewSchema.index({ "location.country": 1 })

export const ProductView = mongoose.model("ProductView", productViewSchema)
