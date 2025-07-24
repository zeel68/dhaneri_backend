import { User } from "../../Models/userModel.js"
import { Product } from "../../Models/productModel.js"
import { Order } from "../../Models/orderModel.js"
import { SessionTracking } from "../../Models/sessionTrackingModel.js"
import { ProductView } from "../../Models/productViewModel.js"
import { CartEvent } from "../../Models/cartEventModel.js"
import { WishlistEvent } from "../../Models/wishlistEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get comprehensive customer analytics
const getCustomerBehaviorAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { period = "30", start, end } = request.query

    const dateFilter = { store_id: new mongoose.Types.ObjectId(storeId) }

    if (start && end) {
      dateFilter.created_at = {
        $gte: new Date(start),
        $lte: new Date(end),
      }
    } else {
      const days = Number.parseInt(period)
      const since = new Date()
      since.setDate(since.getDate() - days)
      dateFilter.created_at = { $gte: since }
    }

    const [
      customerSegmentation,
      customerLifetimeValue,
      customerRetention,
      customerGeography,
      customerDevices,
      customerJourney,
      topCustomers,
      customerActivity,
    ] = await Promise.all([
      // Customer Segmentation
      User.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "orders",
            localField: "_id",
            foreignField: "user_id",
            as: "orders",
          },
        },
        {
          $addFields: {
            totalSpent: { $sum: "$orders.total_amount" },
            orderCount: { $size: "$orders" },
            avgOrderValue: { $divide: [{ $sum: "$orders.total_amount" }, { $size: "$orders" }] },
          },
        },
        {
          $addFields: {
            segment: {
              $switch: {
                branches: [
                  { case: { $and: [{ $gte: ["$totalSpent", 1000] }, { $gte: ["$orderCount", 5] }] }, then: "VIP" },
                  { case: { $and: [{ $gte: ["$totalSpent", 500] }, { $gte: ["$orderCount", 3] }] }, then: "Loyal" },
                  { case: { $and: [{ $gte: ["$totalSpent", 100] }, { $gte: ["$orderCount", 2] }] }, then: "Regular" },
                  { case: { $eq: ["$orderCount", 1] }, then: "One-time" },
                ],
                default: "New",
              },
            },
          },
        },
        {
          $group: {
            _id: "$segment",
            count: { $sum: 1 },
            totalRevenue: { $sum: "$totalSpent" },
            avgOrderValue: { $avg: "$avgOrderValue" },
            avgOrderCount: { $avg: "$orderCount" },
          },
        },
      ]),

      // Customer Lifetime Value
      User.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "orders",
            localField: "_id",
            foreignField: "user_id",
            as: "orders",
          },
        },
        {
          $addFields: {
            totalSpent: { $sum: "$orders.total_amount" },
            orderCount: { $size: "$orders" },
            firstOrderDate: { $min: "$orders.created_at" },
            lastOrderDate: { $max: "$orders.created_at" },
          },
        },
        {
          $addFields: {
            customerLifespanDays: {
              $divide: [
                { $subtract: ["$lastOrderDate", "$firstOrderDate"] },
                86400000, // milliseconds in a day
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgLifetimeValue: { $avg: "$totalSpent" },
            avgOrderFrequency: { $avg: "$orderCount" },
            avgCustomerLifespan: { $avg: "$customerLifespanDays" },
            totalCustomers: { $sum: 1 },
          },
        },
      ]),

      // Customer Retention Analysis
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              month: { $dateToString: { format: "%Y-%m", date: "$created_at" } },
              user_id: "$user_id",
            },
          },
        },
        {
          $group: {
            _id: "$_id.month",
            uniqueUsers: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Customer Geography
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              country: "$location.country",
              city: "$location.city",
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            totalRevenue: { $sum: "$conversion_value" },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            conversionRate: { $divide: ["$conversions", "$sessions"] },
          },
        },
        { $sort: { sessions: -1 } },
        { $limit: 20 },
      ]),

      // Device Analytics
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$device_info.device_type",
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            avgSessionDuration: { $avg: "$session_duration" },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            revenue: { $sum: "$conversion_value" },
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            conversionRate: { $divide: ["$conversions", "$sessions"] },
          },
        },
      ]),

      // Customer Journey Analysis
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: "$referrer.source",
            sessions: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            revenue: { $sum: "$conversion_value" },
            avgSessionDuration: { $avg: "$session_duration" },
          },
        },
        {
          $addFields: {
            conversionRate: { $divide: ["$conversions", "$sessions"] },
            revenuePerSession: { $divide: ["$revenue", "$sessions"] },
          },
        },
        { $sort: { sessions: -1 } },
      ]),

      // Top Customers by Value
      User.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "orders",
            localField: "_id",
            foreignField: "user_id",
            as: "orders",
          },
        },
        {
          $addFields: {
            totalSpent: { $sum: "$orders.total_amount" },
            orderCount: { $size: "$orders" },
            lastOrderDate: { $max: "$orders.created_at" },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 20 },
        {
          $project: {
            name: 1,
            email: 1,
            totalSpent: 1,
            orderCount: 1,
            lastOrderDate: 1,
            avgOrderValue: { $divide: ["$totalSpent", "$orderCount"] },
          },
        },
      ]),

      // Customer Activity Heatmap
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              hour: { $hour: "$created_at" },
              dayOfWeek: { $dayOfWeek: "$created_at" },
            },
            sessions: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
          },
        },
        {
          $addFields: {
            conversionRate: { $divide: ["$conversions", "$sessions"] },
          },
        },
      ]),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          customerSegmentation,
          customerLifetimeValue: customerLifetimeValue[0] || {},
          customerRetention,
          customerGeography,
          customerDevices,
          customerJourney,
          topCustomers,
          customerActivity,
        },
        "Customer behavior analytics fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customer behavior analytics"))
  }
}

// Get product performance analytics
const getProductPerformanceAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { period = "30" } = request.query

    const days = Number.parseInt(period)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [
      mostViewedProducts,
      mostAddedToCart,
      mostWishlisted,
      conversionFunnel,
      productEngagement,
      abandonedCartProducts,
      productRevenueAnalysis,
    ] = await Promise.all([
      // Most Viewed Products
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            viewed_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalViews: { $sum: 1 },
            uniqueViewers: { $addToSet: "$session_id" },
            avgViewDuration: { $avg: "$view_duration" },
            avgScrollDepth: { $avg: "$scroll_depth" },
          },
        },
        {
          $addFields: {
            uniqueViewerCount: { $size: "$uniqueViewers" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            totalViews: 1,
            uniqueViewerCount: 1,
            avgViewDuration: 1,
            avgScrollDepth: 1,
          },
        },
        { $sort: { totalViews: -1 } },
        { $limit: 20 },
      ]),

      // Most Added to Cart
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            event_type: "add",
            event_time: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalAdds: { $sum: 1 },
            uniqueUsers: { $addToSet: "$session_id" },
            totalQuantity: { $sum: "$quantity" },
            conversions: { $sum: { $cond: ["$converted_to_order", 1, 0] } },
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            conversionRate: { $divide: ["$conversions", "$totalAdds"] },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            totalAdds: 1,
            uniqueUserCount: 1,
            totalQuantity: 1,
            conversionRate: 1,
          },
        },
        { $sort: { totalAdds: -1 } },
        { $limit: 20 },
      ]),

      // Most Wishlisted Products
      WishlistEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            event_type: "add",
            event_time: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalWishlists: { $sum: 1 },
            uniqueUsers: { $addToSet: "$session_id" },
            convertedToCart: { $sum: { $cond: ["$converted_to_cart", 1, 0] } },
            convertedToOrder: { $sum: { $cond: ["$converted_to_order", 1, 0] } },
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            cartConversionRate: { $divide: ["$convertedToCart", "$totalWishlists"] },
            orderConversionRate: { $divide: ["$convertedToOrder", "$totalWishlists"] },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            totalWishlists: 1,
            uniqueUserCount: 1,
            cartConversionRate: 1,
            orderConversionRate: 1,
          },
        },
        { $sort: { totalWishlists: -1 } },
        { $limit: 20 },
      ]),

      // Conversion Funnel Analysis
      Product.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "productviews",
            localField: "_id",
            foreignField: "product_id",
            as: "views",
            pipeline: [{ $match: { viewed_at: { $gte: since } } }],
          },
        },
        {
          $lookup: {
            from: "cartevents",
            localField: "_id",
            foreignField: "product_id",
            as: "cartAdds",
            pipeline: [
              {
                $match: {
                  event_type: "add",
                  event_time: { $gte: since },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "orders",
            localField: "_id",
            foreignField: "items.product_id",
            as: "orders",
            pipeline: [{ $match: { created_at: { $gte: since } } }],
          },
        },
        {
          $project: {
            name: 1,
            price: 1,
            images: 1,
            viewCount: { $size: "$views" },
            cartAddCount: { $size: "$cartAdds" },
            orderCount: { $size: "$orders" },
            viewToCartRate: {
              $cond: [{ $gt: [{ $size: "$views" }, 0] }, { $divide: [{ $size: "$cartAdds" }, { $size: "$views" }] }, 0],
            },
            cartToOrderRate: {
              $cond: [
                { $gt: [{ $size: "$cartAdds" }, 0] },
                { $divide: [{ $size: "$orders" }, { $size: "$cartAdds" }] },
                0,
              ],
            },
          },
        },
        { $sort: { viewCount: -1 } },
        { $limit: 20 },
      ]),

      // Product Engagement Metrics
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            viewed_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            avgEngagementTime: { $avg: "$view_duration" },
            avgScrollDepth: { $avg: "$scroll_depth" },
            totalViews: { $sum: 1 },
            bounceRate: {
              $avg: {
                $cond: [{ $lt: ["$view_duration", 10] }, 1, 0],
              },
            },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            avgEngagementTime: 1,
            avgScrollDepth: 1,
            totalViews: 1,
            bounceRate: 1,
          },
        },
        { $sort: { avgEngagementTime: -1 } },
        { $limit: 20 },
      ]),

      // Abandoned Cart Analysis
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            event_type: "add",
            event_time: { $gte: since },
            converted_to_order: false,
          },
        },
        {
          $group: {
            _id: "$product_id",
            abandonedCount: { $sum: 1 },
            totalValue: { $sum: { $multiply: ["$quantity", "$price_at_event"] } },
            avgQuantity: { $avg: "$quantity" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            abandonedCount: 1,
            totalValue: 1,
            avgQuantity: 1,
          },
        },
        { $sort: { totalValue: -1 } },
        { $limit: 20 },
      ]),

      // Product Revenue Analysis
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
            status: { $in: ["completed", "delivered"] },
          },
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product_id",
            totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
            totalQuantitySold: { $sum: "$items.quantity" },
            orderCount: { $sum: 1 },
            avgPrice: { $avg: "$items.price" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            totalRevenue: 1,
            totalQuantitySold: 1,
            orderCount: 1,
            avgPrice: 1,
            revenuePerUnit: { $divide: ["$totalRevenue", "$totalQuantitySold"] },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 },
      ]),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          mostViewedProducts,
          mostAddedToCart,
          mostWishlisted,
          conversionFunnel,
          productEngagement,
          abandonedCartProducts,
          productRevenueAnalysis,
        },
        "Product performance analytics fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product performance analytics"))
  }
}

// Get geographic analytics
const getGeographicAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { period = "30" } = request.query

    const days = Number.parseInt(period)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [countryAnalytics, cityAnalytics, trafficSources, deviceByLocation, conversionByLocation] = await Promise.all(
      [
        // Country-wise Analytics
        SessionTracking.aggregate([
          {
            $match: {
              store_id: new mongoose.Types.ObjectId(storeId),
              created_at: { $gte: since },
            },
          },
          {
            $group: {
              _id: {
                country: "$location.country",
                countryCode: "$location.country_code",
              },
              sessions: { $sum: 1 },
              uniqueUsers: { $addToSet: "$user_id" },
              totalRevenue: { $sum: "$conversion_value" },
              conversions: { $sum: { $cond: ["$converted", 1, 0] } },
              avgSessionDuration: { $avg: "$session_duration" },
              bounceRate: { $avg: { $cond: ["$is_bounce", 1, 0] } },
            },
          },
          {
            $addFields: {
              uniqueUserCount: { $size: "$uniqueUsers" },
              conversionRate: { $divide: ["$conversions", "$sessions"] },
              revenuePerSession: { $divide: ["$totalRevenue", "$sessions"] },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 50 },
        ]),

        // City-wise Analytics
        SessionTracking.aggregate([
          {
            $match: {
              store_id: new mongoose.Types.ObjectId(storeId),
              created_at: { $gte: since },
            },
          },
          {
            $group: {
              _id: {
                city: "$location.city",
                country: "$location.country",
              },
              sessions: { $sum: 1 },
              uniqueUsers: { $addToSet: "$user_id" },
              totalRevenue: { $sum: "$conversion_value" },
              conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            },
          },
          {
            $addFields: {
              uniqueUserCount: { $size: "$uniqueUsers" },
              conversionRate: { $divide: ["$conversions", "$sessions"] },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 30 },
        ]),

        // Traffic Sources by Location
        SessionTracking.aggregate([
          {
            $match: {
              store_id: new mongoose.Types.ObjectId(storeId),
              created_at: { $gte: since },
            },
          },
          {
            $group: {
              _id: {
                country: "$location.country",
                source: "$referrer.source",
              },
              sessions: { $sum: 1 },
              conversions: { $sum: { $cond: ["$converted", 1, 0] } },
              revenue: { $sum: "$conversion_value" },
            },
          },
          {
            $addFields: {
              conversionRate: { $divide: ["$conversions", "$sessions"] },
            },
          },
          { $sort: { sessions: -1 } },
          { $limit: 50 },
        ]),

        // Device Usage by Location
        SessionTracking.aggregate([
          {
            $match: {
              store_id: new mongoose.Types.ObjectId(storeId),
              created_at: { $gte: since },
            },
          },
          {
            $group: {
              _id: {
                country: "$location.country",
                deviceType: "$device_info.device_type",
              },
              sessions: { $sum: 1 },
              conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            },
          },
          {
            $addFields: {
              conversionRate: { $divide: ["$conversions", "$sessions"] },
            },
          },
          { $sort: { sessions: -1 } },
        ]),

        // Conversion Analysis by Location
        SessionTracking.aggregate([
          {
            $match: {
              store_id: new mongoose.Types.ObjectId(storeId),
              created_at: { $gte: since },
              converted: true,
            },
          },
          {
            $group: {
              _id: "$location.country",
              totalConversions: { $sum: 1 },
              totalRevenue: { $sum: "$conversion_value" },
              avgOrderValue: { $avg: "$conversion_value" },
            },
          },
          { $sort: { totalRevenue: -1 } },
        ]),
      ],
    )

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          countryAnalytics,
          cityAnalytics,
          trafficSources,
          deviceByLocation,
          conversionByLocation,
        },
        "Geographic analytics fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching geographic analytics"))
  }
}

// Get real-time analytics
const getRealTimeAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)

    const [activeUsers, recentActivity, liveConversions, topPages, realtimeMetrics] = await Promise.all([
      // Active Users (last hour)
      SessionTracking.countDocuments({
        store_id: new mongoose.Types.ObjectId(storeId),
        last_activity: { $gte: lastHour },
      }),

      // Recent Activity
      SessionTracking.find({
        store_id: new mongoose.Types.ObjectId(storeId),
        created_at: { $gte: last24Hours },
      })
        .sort({ created_at: -1 })
        .limit(50)
        .populate("user_id", "name email")
        .select("user_id location device_info referrer created_at converted conversion_value"),

      // Live Conversions (last 24 hours)
      Order.find({
        store_id: new mongoose.Types.ObjectId(storeId),
        created_at: { $gte: last24Hours },
      })
        .sort({ created_at: -1 })
        .limit(20)
        .populate("user_id", "name email")
        .select("order_number total_amount user_id created_at items"),

      // Top Pages/Products (last hour)
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            viewed_at: { $gte: lastHour },
          },
        },
        {
          $group: {
            _id: "$product_id",
            views: { $sum: 1 },
            uniqueViewers: { $addToSet: "$session_id" },
          },
        },
        {
          $addFields: {
            uniqueViewerCount: { $size: "$uniqueViewers" },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        { $unwind: "$product" },
        {
          $project: {
            productName: "$product.name",
            views: 1,
            uniqueViewerCount: 1,
          },
        },
        { $sort: { views: -1 } },
        { $limit: 10 },
      ]),

      // Real-time Metrics
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: last24Hours },
          },
        },
        {
          $group: {
            _id: {
              hour: { $hour: "$created_at" },
            },
            sessions: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            revenue: { $sum: "$conversion_value" },
          },
        },
        { $sort: { "_id.hour": 1 } },
      ]),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          activeUsers,
          recentActivity,
          liveConversions,
          topPages,
          realtimeMetrics,
        },
        "Real-time analytics fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching real-time analytics"))
  }
}

// Get conversion funnel analytics
const getConversionFunnelAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { period = "30" } = request.query

    const days = Number.parseInt(period)
    const since = new Date()
    since.setDate(since.getDate() - days)

    const [overallFunnel, funnelBySource, funnelByDevice, abandonmentAnalysis] = await Promise.all([
      // Overall Conversion Funnel
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
          },
        },
        {
          $facet: {
            totalSessions: [{ $count: "count" }],
            productViews: [
              {
                $lookup: {
                  from: "productviews",
                  localField: "session_id",
                  foreignField: "session_id",
                  as: "views",
                },
              },
              { $match: { views: { $ne: [] } } },
              { $count: "count" },
            ],
            cartAdds: [
              {
                $lookup: {
                  from: "cartevents",
                  localField: "session_id",
                  foreignField: "session_id",
                  as: "cartEvents",
                  pipeline: [{ $match: { event_type: "add" } }],
                },
              },
              { $match: { cartEvents: { $ne: [] } } },
              { $count: "count" },
            ],
            conversions: [{ $match: { converted: true } }, { $count: "count" }],
          },
        },
      ]),

      // Funnel by Traffic Source
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$referrer.source",
            totalSessions: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            revenue: { $sum: "$conversion_value" },
          },
        },
        {
          $addFields: {
            conversionRate: { $divide: ["$conversions", "$totalSessions"] },
            revenuePerSession: { $divide: ["$revenue", "$totalSessions"] },
          },
        },
        { $sort: { totalSessions: -1 } },
      ]),

      // Funnel by Device Type
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$device_info.device_type",
            totalSessions: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            avgSessionDuration: { $avg: "$session_duration" },
            bounceRate: { $avg: { $cond: ["$is_bounce", 1, 0] } },
          },
        },
        {
          $addFields: {
            conversionRate: { $divide: ["$conversions", "$totalSessions"] },
          },
        },
      ]),

      // Cart Abandonment Analysis
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            event_type: "add",
            event_time: { $gte: since },
          },
        },
        {
          $group: {
            _id: {
              hour: { $hour: "$event_time" },
              dayOfWeek: { $dayOfWeek: "$event_time" },
            },
            totalCartAdds: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted_to_order", 1, 0] } },
          },
        },
        {
          $addFields: {
            abandonmentRate: {
              $subtract: [1, { $divide: ["$conversions", "$totalCartAdds"] }],
            },
          },
        },
      ]),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          overallFunnel: overallFunnel[0] || {},
          funnelBySource,
          funnelByDevice,
          abandonmentAnalysis,
        },
        "Conversion funnel analytics fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching conversion funnel analytics"))
  }
}

export {
  getCustomerBehaviorAnalytics,
  getProductPerformanceAnalytics,
  getGeographicAnalytics,
  getRealTimeAnalytics,
  getConversionFunnelAnalytics,
}
