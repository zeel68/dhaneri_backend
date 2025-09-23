// Models/wishlistModel.js
import mongoose from "mongoose";

const wishlistItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductVariant",
    default: null
  },
  size_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductSizes",
    default: null
  },
  added_at: {
    type: Date,
    default: Date.now
  }
});

const wishlistSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  session_id: {
    type: String,
    default: null
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
    required: true
  },
  items: [wishlistItemSchema]
}, {
  timestamps: true
});

// Index for efficient querying
wishlistSchema.index({ user_id: 1, store_id: 1 });
wishlistSchema.index({ session_id: 1, store_id: 1 });

export const Wishlist = mongoose.model("Wishlist", wishlistSchema);