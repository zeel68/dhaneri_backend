import { isStoreOwner, verifyJWT } from "../Middleware/auth.middleware.js"
import {
  addStoreCategory,
  getAvailableTags,
  getProductsByTags,
  getProductsByTagValues,
  getStoreCategories,
  getStoreCategory,
  getTagUsageStats,
  getTagValues,
  updateStoreCategory,
  deleteStoreCategory,
  toggleStoreCategoryStatus,
  getStoreCategoriesName,
} from "../Controller/storeAdmin/categoryController.js"
import {
  getCustomerAnalytics,
  getInventoryAnalytics,
  getStoreDashboard,
  getStoreSalesAnalytics,
  getTopSellingProducts,
} from "../Controller/storeAdmin/analyticsController.js"
import {
  addProduct,
  addProductToCategory,
  bulkUpdateProducts,
  deleteProduct,
  getLowStockProducts,
  getOutOfStockProducts,
  getProductById,
  getStoreProducts,
  updateProduct,
} from "../Controller/storeAdmin/productController.js"
import {
  getStoreConfig,
  getStoreDetails,
  getStoreTheme,
  updateStoreAttributes,
  updateStoreConfig,
  updateStoreFeatures,
  updateStoreTheme,
} from "../Controller/storeAdmin/storeController.js"
import {
  addTrendingCategory,
  addTrendingProduct,
  createHeroSlide,
  getHeroSlides,
  getHomepageConfig,
  getTrendingProducts,
  updateHeroSlide,
  updateTrendingCategory,
  updateTrendingProduct,
} from "../Controller/storeAdmin/homepageController.js"
import {
  getStoreOrders,
  getOrderById,
  updateOrderStatus,
  updateOrder,
} from "../Controller/storeAdmin/orderController.js"
import {
  getStoreCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../Controller/storeAdmin/customerController.js"
import {
  getInventoryOverview,
  updateStock,
  bulkUpdateStock,
  getInventoryAlerts,
} from "../Controller/storeAdmin/inventoryController.js"
import {
  getStoreCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  duplicateCoupon,
} from "../Controller/storeAdmin/couponController.js"
import {
  getStoreReviews,
  updateReviewStatus,
  replyToReview,
  deleteReview,
} from "../Controller/storeAdmin/reviewController.js"
import {
  getCustomerBehaviorAnalytics,
  getProductPerformanceAnalytics,
  getGeographicAnalytics,
  getRealTimeAnalytics,
  getConversionFunnelAnalytics,
} from "../Controller/storeAdmin/advancedAnalyticsController.js"
import {
  trackSession,
  trackProductView,
  trackCartEvent,
  trackWishlistEvent,
  endSession,
} from "../Controller/storeAdmin/trackingController.js"
import { uploadMultiple, uploadSingle, uploadFields } from "../Middleware/upload.middleware.js"

export default async function storeAdminRoutes(fastify, options) {
  // Apply authentication and store owner verification to all routes
  fastify.addHook("preHandler", verifyJWT)
  fastify.addHook("preHandler", isStoreOwner)

  // === ORDER MANAGEMENT ROUTES ===
  fastify.get("/orders", getStoreOrders)
  fastify.get("/orders/:orderId", getOrderById)
  fastify.put("/orders/:orderId/status", updateOrderStatus)
  fastify.put("/orders/:orderId", updateOrder)

  // === CUSTOMER MANAGEMENT ROUTES ===
  fastify.get("/customers", getStoreCustomers)
  fastify.get("/customers/:customerId", getCustomerById)
  fastify.post("/customers", createCustomer)
  fastify.put("/customers/:customerId", updateCustomer)
  fastify.delete("/customers/:customerId", deleteCustomer)

  // === INVENTORY MANAGEMENT ROUTES ===
  fastify.get("/inventory", getInventoryOverview)
  fastify.get("/inventory/alerts", getInventoryAlerts)
  fastify.put("/inventory/:productId/stock", updateStock)
  fastify.put("/inventory/bulk-update", bulkUpdateStock)

  // === COUPON MANAGEMENT ROUTES ===
  fastify.get("/coupons", getStoreCoupons)
  fastify.get("/coupons/:couponId", getCouponById)
  fastify.post("/coupons", createCoupon)
  fastify.put("/coupons/:couponId", updateCoupon)
  fastify.delete("/coupons/:couponId", deleteCoupon)
  fastify.post("/coupons/:couponId/duplicate", duplicateCoupon)

  // === REVIEW MANAGEMENT ROUTES ===
  fastify.get("/reviews", getStoreReviews)
  fastify.put("/reviews/:reviewId/status", updateReviewStatus)
  fastify.post("/reviews/:reviewId/reply", replyToReview)
  fastify.delete("/reviews/:reviewId", deleteReview)

  // === DASHBOARD & ANALYTICS ROUTES ===
  fastify.get("/dashboard", getStoreDashboard)
  fastify.get("/analytics/sales", getStoreSalesAnalytics)
  fastify.get("/analytics/products/top-selling", getTopSellingProducts)
  fastify.get("/analytics/customers", getCustomerAnalytics)
  fastify.get("/analytics/inventory", getInventoryAnalytics)

  // === ADVANCED ANALYTICS ROUTES ===
  fastify.get("/analytics/customer-behavior", getCustomerBehaviorAnalytics)
  fastify.get("/analytics/product-performance", getProductPerformanceAnalytics)
  fastify.get("/analytics/geographic", getGeographicAnalytics)
  fastify.get("/analytics/realtime", getRealTimeAnalytics)
  fastify.get("/analytics/conversion-funnel", getConversionFunnelAnalytics)

  // === TRACKING ROUTES ===
  fastify.post("/track/session/:store_id", trackSession)
  fastify.post("/track/product-view/:store_id/:product_id", trackProductView)
  fastify.post("/track/cart-event/:store_id", trackCartEvent)
  fastify.post("/track/wishlist-event/:store_id", trackWishlistEvent)
  fastify.put("/track/session/:session_id/end", endSession)

  // === PRODUCT MANAGEMENT ROUTES ===
  fastify.post("/products", { preHandler: uploadMultiple("images", 5) }, addProduct)
  fastify.get("/products", getStoreProducts)
  fastify.get("/products/:productId", getProductById)
  fastify.put("/products/:productId", { preHandler: uploadMultiple("images", 5) }, updateProduct)
  fastify.delete("/products/:productId", deleteProduct)
  fastify.patch("/products/bulk-update", bulkUpdateProducts)
  fastify.get("/products/inventory/low-stock", getLowStockProducts)
  fastify.get("/products/inventory/out-of-stock", getOutOfStockProducts)
  fastify.post("/products/addToCategory", addProductToCategory)

  // === STORE CONFIGURATION ROUTES ===
  fastify.get("/store", getStoreDetails)
  fastify.put(
    "/store/config",
    {
      preHandler: uploadFields([
        { name: "store_logo", maxCount: 1 },
        { name: "store_banner", maxCount: 1 },
      ]),
    },
    updateStoreConfig,
  )
  fastify.get("/store/config", getStoreConfig)
  fastify.put("/store/theme", updateStoreTheme)
  fastify.get("/store/theme", getStoreTheme)
  fastify.put("/store/features", updateStoreFeatures)
  fastify.put("/store/attributes", updateStoreAttributes)

  // === HOMEPAGE MANAGEMENT ROUTES ===
  fastify.get("/homepage/config", getHomepageConfig)
  fastify.get("/homepage/hero", getHeroSlides)
  fastify.post("/homepage/hero", { preHandler: uploadSingle("hero_image") }, createHeroSlide)
  fastify.put("/homepage/hero/:slideId", { preHandler: uploadSingle("hero_image") }, updateHeroSlide)
  fastify.post("/homepage/trendingCategory", addTrendingCategory)
  fastify.put("/homepage/trendingCategory", updateTrendingCategory)
  fastify.get("/homepage/trendingProducts", getTrendingProducts)
  fastify.post("/homepage/trendingProducts", addTrendingProduct)
  fastify.put("/homepage/trendingProducts/:trendingId", updateTrendingProduct)

  // === CATEGORY & TAG MANAGEMENT ROUTES ===
  fastify.get("/category", getStoreCategory)
  fastify.post("/category", addStoreCategory)
  fastify.get("/getStoreCategories", getStoreCategories)
  fastify.get("/getStoreCategoriesName", getStoreCategoriesName)
  fastify.get("/category/tags", getAvailableTags)
  fastify.get("/category/tags/stats", getTagUsageStats)
  fastify.get("/category/tags/:tagName/values", getTagValues)
  fastify.get("/products/filter/tags", getProductsByTags)
  fastify.get("/products/filter/tag-values", getProductsByTagValues)
  fastify.put("/category/:category_id", updateStoreCategory)
  fastify.delete("/category/:category_id", deleteStoreCategory)
  fastify.post("/category/:category_id/status", toggleStoreCategoryStatus)
}
