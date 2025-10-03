import { addGlobalCategory, getGlobalCategories } from "../Controller/superAdmin/SuperAdminCategoryController.js";

import { verifyJWT, isSuperAdmin } from "../Middleware/auth.middleware.js";
import { addStoreCategory, getStoreCategories, getStoreCategory } from "../Controller/storeAdmin/categoryController.js";
import { getStoreDetails } from "../Controller/storeAdmin/storeController.js";
import { createStore, getAllStores } from "../Controller/superAdmin/storeController.js";

// Category Controllers

export default async function superAdminRouter(fastify, options) {
    // Apply authentication and store owner verification to all routes
    fastify.addHook("preHandler", verifyJWT)
    fastify.addHook("preHandler", isSuperAdmin)

    fastify.get("/category", getGlobalCategories)
    fastify.post("/category", addGlobalCategory)

    // fastify.get("/orders", getStoreOrders)
    // fastify.put("/orders/:order_id/status", updateOrderStatus)

    // === DASHBOARD & ANALYTICS ROUTES ===
    // fastify.get("/dashboard", getStoreDashboard)
    // fastify.get("/analytics/sales", getStoreSalesAnalytics)
    // fastify.get("/analytics/products/top-selling", getTopSellingProducts)
    // fastify.get("/analytics/customers", getCustomerAnalytics)
    // fastify.get("/analytics/inventory", getInventoryAnalytics)

    // === PRODUCT MANAGEMENT ROUTES ===
    // fastify.post("/products", addProduct)
    // fastify.get("/products", getStoreProducts)
    // fastify.get("/products/:productId", getProductById)
    // fastify.put("/products/:productId", updateProduct)
    // fastify.delete("/products/:productId", deleteProduct)
    // fastify.patch("/products/bulk-update", bulkUpdateProducts)
    // fastify.get("/products/inventory/low-stock", getLowStockProducts)
    // fastify.get("/products/inventory/out-of-stock", getOutOfStockProducts)

    // === STORE CONFIGURATION ROUTES ===
    fastify.get("/stores", getAllStores)
    fastify.post("/store", createStore)
    // fastify.put("/store/config", updateStoreConfig)
    // fastify.get("/store/config", getStoreConfig)
    // fastify.put("/store/theme", updateStoreTheme)
    // fastify.get("/store/theme", getStoreTheme)
    // fastify.put("/store/features", updateStoreFeatures)
    // fastify.put("/store/attributes", updateStoreAttributes)

    // === HOMEPAGE MANAGEMENT ROUTES ===
    // fastify.get("/homepage/config", getHomepageConfig)
    // fastify.put("/homepage/config", updateHomepageConfig)
    // fastify.put("/homepage/hero", updateHeroSection)
    // fastify.put("/homepage/featured-products", setFeaturedProducts)
    // fastify.get("/homepage/featured-products/details", getFeaturedProductsDetails)
    // fastify.put("/homepage/categories", updateCategoriesSection)
    // fastify.put("/homepage/testimonials", updateTestimonialsSection)

    // // === CATEGORY & TAG MANAGEMENT ROUTES ===
    // fastify.get("/category", getStoreCategory)
    // fastify.get("/category/tags", getAvailableTags)
    // fastify.get("/category/tags/stats", getTagUsageStats)
    // fastify.get("/category/tags/:tagName/values", getTagValues)
    // fastify.get("/products/filter/tags", getProductsByTags)
    // fastify.get("/products/filter/tag-values", getProductsByTagValues)

}
