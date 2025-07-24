import {User} from "../../Models/userModel.js";
import {Product} from "../../Models/productModel.js";
import {Order} from "../../Models/orderModel.js";
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// 1. Store Dashboard Summary
const getStoreDashboard = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        // Get current month date range
        const currentMonth = new Date()
        currentMonth.setDate(1)
        currentMonth.setHours(0, 0, 0, 0)

        const nextMonth = new Date(currentMonth)
        nextMonth.setMonth(nextMonth.getMonth() + 1)

        const [
            totalProducts,
            totalOrders,
            totalCustomers,
            monthlyRevenue,
            pendingOrders,
            lowStockCount,
            outOfStockCount,
            recentOrders,
            topProducts,
        ] = await Promise.all([
            Product.countDocuments({ store_id: storeId }),
            Order.countDocuments({ store_id: storeId }),
            User.countDocuments({ store_id: storeId, role_name: "customer" }),
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered"] },
                        created_at: { $gte: currentMonth, $lt: nextMonth },
                    },
                },
                { $group: { _id: null, total: { $sum: "$total_amount" } } },
            ]),
            Order.countDocuments({ store_id: storeId, status: "pending" }),
            Product.countDocuments({ store_id: storeId, "stock.quantity": { $lte: 5, $gt: 0 } }),
            Product.countDocuments({ store_id: storeId, "stock.quantity": { $lte: 0 } }),
            Order.find({ store_id: storeId })
                .populate("user_id", "name email")
                .sort({ created_at: -1 })
                .limit(5)
                .select("total_amount status created_at user_id"),
            Product.find({ store_id: storeId }).sort({ "ratings.average": -1 }).limit(5).select("name price ratings images"),
        ])

        const dashboard = {
            overview: {
                totalProducts,
                totalOrders,
                totalCustomers,
                monthlyRevenue: monthlyRevenue[0]?.total || 0,
                pendingOrders,
            },
            inventory: {
                lowStockCount,
                outOfStockCount,
                totalProducts,
            },
            recentActivity: {
                recentOrders,
                topProducts,
            },
        }

        return reply.code(200).send(new ApiResponse(200, dashboard, "Store dashboard data fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store dashboard"))
    }
}

// 2. Store Sales Analytics
const getStoreSalesAnalytics = async (request, reply) => {
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

        const [salesTrend, totalSales, orderStats, paymentStats] = await Promise.all([
            // Daily sales trend
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                        revenue: { $sum: "$total_amount" },
                        orders: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            // Total sales summary
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$total_amount" },
                        totalOrders: { $sum: 1 },
                        averageOrderValue: { $avg: "$total_amount" },
                    },
                },
            ]),
            // Order status breakdown
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$total_amount" },
                    },
                },
            ]),
            // Payment method breakdown
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: "$payment_method",
                        count: { $sum: 1 },
                        revenue: { $sum: "$total_amount" },
                    },
                },
            ]),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    salesTrend,
                    summary: totalSales[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
                    orderStats,
                    paymentStats,
                },
                "Store sales analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store sales analytics"))
    }
}

// 3. Top Selling Products for Store
const getTopSellingProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { limit = 10, period = "30" } = request.query

        const days = Number.parseInt(period)
        const since = new Date()
        since.setDate(since.getDate() - days)

        const topProducts = await Order.aggregate([
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
                    totalSold: { $sum: "$items.quantity" },
                    totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                    orderCount: { $sum: 1 },
                },
            },
            { $sort: { totalSold: -1 } },
            { $limit: Number.parseInt(limit) },
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
                    productId: "$_id",
                    productName: "$product.name",
                    productImage: { $arrayElemAt: ["$product.images", 0] },
                    price: "$product.price",
                    totalSold: 1,
                    totalRevenue: 1,
                    orderCount: 1,
                },
            },
        ])

        return reply.code(200).send(new ApiResponse(200, topProducts, "Top selling products fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching top selling products"))
    }
}

// 4. Customer Analytics for Store
const getCustomerAnalytics = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { period = "30" } = request.query

        const days = Number.parseInt(period)
        const since = new Date()
        since.setDate(since.getDate() - days)

        const [customerGrowth, topCustomers, customerStats, customerRetention] = await Promise.all([
            // Customer registration trend
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        role_name: "customer",
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                        newCustomers: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            // Top customers by order value
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                        status: { $in: ["completed", "delivered"] },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        totalSpent: { $sum: "$total_amount" },
                        orderCount: { $sum: 1 },
                        lastOrderDate: { $max: "$created_at" },
                    },
                },
                { $sort: { totalSpent: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: "users",
                        localField: "_id",
                        foreignField: "_id",
                        as: "customer",
                    },
                },
                { $unwind: "$customer" },
                {
                    $project: {
                        customerId: "$_id",
                        customerName: "$customer.name",
                        customerEmail: "$customer.email",
                        totalSpent: 1,
                        orderCount: 1,
                        lastOrderDate: 1,
                        averageOrderValue: { $divide: ["$totalSpent", "$orderCount"] },
                    },
                },
            ]),
            // Customer statistics
            User.aggregate([
                { $match: { store_id: new mongoose.Types.ObjectId(storeId), role_name: "customer" } },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        activeCustomers: {
                            $sum: {
                                $cond: [{ $gte: ["$last_login", since] }, 1, 0],
                            },
                        },
                    },
                },
            ]),
            // Customer retention (repeat customers)
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        orderCount: { $sum: 1 },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        repeatCustomers: {
                            $sum: { $cond: [{ $gt: ["$orderCount", 1] }, 1, 0] },
                        },
                    },
                },
                {
                    $project: {
                        totalCustomers: 1,
                        repeatCustomers: 1,
                        retentionRate: {
                            $multiply: [{ $divide: ["$repeatCustomers", "$totalCustomers"] }, 100],
                        },
                    },
                },
            ]),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    customerGrowth,
                    topCustomers,
                    stats: customerStats[0] || { totalCustomers: 0, activeCustomers: 0 },
                    retention: customerRetention[0] || { totalCustomers: 0, repeatCustomers: 0, retentionRate: 0 },
                },
                "Customer analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customer analytics"))
    }
}

// 5. Inventory Analytics
const getInventoryAnalytics = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const [inventoryStatus, categoryBreakdown, stockMovement, topSellingByCategory] = await Promise.all([
            // Inventory status summary
            Product.aggregate([
                { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
                {
                    $group: {
                        _id: null,
                        totalProducts: { $sum: 1 },
                        totalStock: { $sum: "$stock.quantity" },
                        totalValue: { $sum: { $multiply: ["$stock.quantity", "$price"] } },
                        lowStock: {
                            $sum: {
                                $cond: [{ $and: [{ $lte: ["$stock.quantity", 5] }, { $gt: ["$stock.quantity", 0] }] }, 1, 0],
                            },
                        },
                        outOfStock: {
                            $sum: {
                                $cond: [{ $lte: ["$stock.quantity", 0] }, 1, 0],
                            },
                        },
                        averagePrice: { $avg: "$price" },
                        averageRating: { $avg: "$ratings.average" },
                    },
                },
            ]),
            // Products by category
            Product.aggregate([
                { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
                {
                    $lookup: {
                        from: "categories",
                        localField: "parent_category",
                        foreignField: "_id",
                        as: "categoryInfo",
                    },
                },
                { $unwind: "$categoryInfo" },
                {
                    $group: {
                        _id: "$categoryInfo.name",
                        productCount: { $sum: 1 },
                        totalStock: { $sum: "$stock.quantity" },
                        averagePrice: { $avg: "$price" },
                        totalValue: { $sum: { $multiply: ["$stock.quantity", "$price"] } },
                    },
                },
                { $sort: { productCount: -1 } },
            ]),
            // Recent stock changes
            Product.find({ store_id: storeId })
                .sort({ updated_at: -1 })
                .limit(10)
                .select("name stock.quantity price updated_at")
                .populate("parent_category", "name"),
            // Top selling products by category
            Product.aggregate([
                { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
                {
                    $lookup: {
                        from: "categories",
                        localField: "parent_category",
                        foreignField: "_id",
                        as: "categoryInfo",
                    },
                },
                { $unwind: "$categoryInfo" },
                {
                    $group: {
                        _id: "$categoryInfo.name",
                        products: {
                            $push: {
                                name: "$name",
                                rating: "$ratings.average",
                                reviewCount: "$ratings.count",
                                stock: "$stock.quantity",
                            },
                        },
                    },
                },
                {
                    $project: {
                        categoryName: "$_id",
                        topProducts: { $slice: ["$products", 3] },
                    },
                },
            ]),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    summary: inventoryStatus[0] || {
                        totalProducts: 0,
                        totalStock: 0,
                        totalValue: 0,
                        lowStock: 0,
                        outOfStock: 0,
                        averagePrice: 0,
                        averageRating: 0,
                    },
                    categoryBreakdown,
                    recentUpdates: stockMovement,
                    topSellingByCategory,
                },
                "Inventory analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching inventory analytics"))
    }
}

export { getStoreDashboard, getStoreSalesAnalytics, getTopSellingProducts, getCustomerAnalytics, getInventoryAnalytics }
