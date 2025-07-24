// Storefront Routes - Customer facing API endpoints
import {
  getStorefrontProducts,
  getStorefrontProductDetails,
  getStorefrontProductFilters,
  searchStorefrontProducts,
  getFeaturedProducts,
  getNewArrivals,
} from "../Controller/storeFront/productController.js"

import {
  getStoreCategory,
  getCategorySubcategories,
  getCategoryAttributes,
} from "../Controller/storeFront/categoryController.js"

import {
  addToCart,
  getCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  applyCoupon,
  validateCoupon,
  removeCoupon,
} from "../Controller/storeFront/cartController.js"

import {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlistStatus,
} from "../Controller/storeFront/wishlistController.js"

import {
  getHomepageData,
  getHeroSection,
  getTestimonials,
  getStoreInfo,
} from "../Controller/storeFront/homepageController.js"

import {
  createOrder,
  getUserOrders,
  getOrderDetails,
  cancelOrder,
  trackOrder,
} from "../Controller/storeFront/orderController.js"

import {
  initializePayment,
  processPaymentCallback,
  getPaymentStatus,
  getPaymentMethods,
} from "../Controller/storeFront/paymentController.js"

import {
  addProductReview,
  getProductReviews,
  updateProductReview,
  deleteProductReview,
  getUserProductReview,
} from "../Controller/storeFront/reviewController.js"
import { getHomepageConfig } from "../Controller/storeAdmin/homepageController.js"
import { verifyJWT } from "../Middleware/auth.middleware.js"

export default async function storefrontRoutes(fastify, opts) {
  // Store and Homepage Routes
  fastify.get("/store/:store_id", getStoreInfo)
  fastify.get("/store/:store_id/homepage", getHomepageData)
  fastify.get("/store/:store_id/hero", getHeroSection)
  fastify.get("/store/:store_id/testimonials", getTestimonials)

  // Category Routes
  fastify.get("/store/:store_id/category", getStoreCategory)
  fastify.get("/store/:store_id/category/subcategories", getCategorySubcategories)
  fastify.get("/store/:store_id/category/attributes", getCategoryAttributes)

  // Product Routes
  fastify.get("/store/:store_id/products", getStorefrontProducts)
  fastify.get("/store/:store_id/products/featured", getFeaturedProducts)
  fastify.get("/store/:store_id/products/new-arrivals", getNewArrivals)
  fastify.get("/store/:store_id/products/search", searchStorefrontProducts)
  fastify.get("/store/:store_id/products/filters", getStorefrontProductFilters)
  fastify.get("/store/:store_id/products/:product_id", getStorefrontProductDetails)

  // Cart Routes
  fastify.post("/store/:store_id/cart/add", addToCart)
  fastify.get("/store/:store_id/cart", getCart)
  fastify.put("/store/:store_id/cart/update", updateCartItem)
  fastify.delete("/store/:store_id/cart/remove", removeCartItem)
  fastify.delete("/store/:store_id/cart/clear", clearCart)
  fastify.post("/store/:store_id/cart/coupon", applyCoupon)
  fastify.post("/store/:store_id/cart/coupon/validate", validateCoupon)
  fastify.delete("/store/:store_id/cart/coupon", removeCoupon)

  // Wishlist Routes (require authentication)
  fastify.post("/store/:store_id/wishlist/add", addToWishlist)
  fastify.get("/store/:store_id/wishlist", getWishlist)
  fastify.delete("/store/:store_id/wishlist/remove", removeFromWishlist)
  fastify.delete("/store/:store_id/wishlist/clear", clearWishlist)
  fastify.get("/store/:store_id/wishlist/check/:product_id", checkWishlistStatus)

  // Order Routes (require authentication)
  fastify.post("/store/:store_id/orders", { preHandler: verifyJWT }, createOrder)
  fastify.get("/store/:store_id/orders", { preHandler: verifyJWT }, getUserOrders)
  fastify.get("/store/:store_id/orders/:order_id", { preHandler: verifyJWT }, getOrderDetails)
  fastify.patch("/store/:store_id/orders/:order_id/cancel", { preHandler: verifyJWT }, cancelOrder)
  fastify.get("/store/:store_id/track/:order_number", trackOrder)

  // Payment Routes
  fastify.get("/store/:store_id/payment/methods", getPaymentMethods)
  fastify.post("/store/:store_id/payment/initialize", { preHandler: verifyJWT }, initializePayment)
  fastify.post("/store/:store_id/payment/callback", processPaymentCallback)
  fastify.get("/store/:store_id/payment/:payment_id/status", getPaymentStatus)

  // Review Routes
  fastify.post("/store/:store_id/products/:product_id/reviews", { preHandler: verifyJWT }, addProductReview)
  fastify.get("/store/:store_id/products/:product_id/reviews", getProductReviews)
  fastify.put("/store/:store_id/products/:product_id/reviews", { preHandler: verifyJWT }, updateProductReview)
  fastify.delete("/store/:store_id/products/:product_id/reviews", { preHandler: verifyJWT }, deleteProductReview)
  fastify.get(
    "/store/:store_id/products/:product_id/reviews/user",
    { preHandler: verifyJWT },
    getUserProductReview,
  )
}
