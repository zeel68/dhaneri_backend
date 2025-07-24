import mongoose from "mongoose"
const { Schema } = mongoose

const sessionTrackingSchema = new Schema(
  {
    session_id: {
      type: String,
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
      timezone: String,
    },
    device_info: {
      type: {
        type: String,
        enum: ["desktop", "mobile", "tablet"],
        default: "desktop",
      },
      browser: String,
      os: String,
      screen_resolution: String,
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
    pages_visited: [
      {
        url: String,
        title: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        time_spent: Number, // in seconds
      },
    ],
    session_duration: {
      type: Number,
      default: 0, // in seconds
    },
    is_bounce: {
      type: Boolean,
      default: false,
    },
    conversion_events: [
      {
        event_type: {
          type: String,
          enum: ["cart_add", "wishlist_add", "purchase", "signup", "newsletter"],
        },
        product_id: {
          type: Schema.Types.ObjectId,
          ref: "Product",
        },
        value: Number,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    session_start: {
      type: Date,
      default: Date.now,
    },
    session_end: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
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
sessionTrackingSchema.index({ session_id: 1, store_id: 1 })
sessionTrackingSchema.index({ user_id: 1, store_id: 1 })
sessionTrackingSchema.index({ created_at: -1 })
sessionTrackingSchema.index({ "location.country": 1 })
sessionTrackingSchema.index({ "utm_params.campaign": 1 })

export const SessionTracking = mongoose.model("SessionTracking", sessionTrackingSchema)
