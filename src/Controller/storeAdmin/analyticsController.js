import { User } from "../../Models/userModel.js";
import { Product } from "../../Models/productModel.js";
import { Order } from "../../Models/orderModel.js";
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"
import { ProductView } from "../../Models/productViewModel.js";
import { CartEvent } from "../../Models/cartEventModel.js";
import { SessionTracking } from "../../Models/sessionTrackingModel.js";

// 1. Store Dashboard Summary
const getStoreDashboard = async (request, reply) => {
    try {
        const storeId = request.user.store_id;
        const { date_range = "last_30_days" } = request.query;

        // Date range calculation
        const getDateRange = (range) => {
            const now = new Date();
            const ranges = {
                today: {
                    start: new Date(now.setHours(0, 0, 0, 0)),
                    end: new Date(now.setHours(23, 59, 59, 999))
                },
                yesterday: {
                    start: new Date(now.setDate(now.getDate() - 1)),
                    end: new Date(now.setHours(23, 59, 59, 999))
                },
                last_7_days: {
                    start: new Date(now.setDate(now.getDate() - 7)),
                    end: new Date()
                },
                last_30_days: {
                    start: new Date(now.setDate(now.getDate() - 30)),
                    end: new Date()
                },
                this_month: {
                    start: new Date(now.getFullYear(), now.getMonth(), 1),
                    end: new Date()
                },
                last_month: {
                    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
                    end: new Date(now.getFullYear(), now.getMonth(), 0)
                }
            };
            return ranges[range] || ranges.last_30_days;
        };

        const { start: currentStart, end: currentEnd } = getDateRange(date_range);
        const previousRange = getDateRange('last_month');

        // Main dashboard data aggregation
        const [
            // Basic counts
            totalProducts,
            totalOrders,
            totalCustomers,
            monthlyRevenue,
            pendingOrders,
            lowStockCount,
            outOfStockCount,

            // Previous period for growth calculation
            previousRevenue,
            previousOrders,
            previousCustomers,

            // Revenue trend data
            revenueTrend,

            // Customer analytics
            newCustomers,
            customerSegments,

            // Product analytics
            topSellingProducts,
            lowStockProducts,

            // Detailed Geographic data
            geographicSalesByCountry,
            geographicSalesByState,
            geographicSalesByCity,

            // Conversion funnel
            conversionData,

            // Session and traffic data
            sessionData,
            trafficSources,

            // Product performance
            productViews,
            cartAdditions,

            // Customer behavior
            returningCustomers,
            customerAcquisition
        ] = await Promise.all([
            // Basic counts
            Product.countDocuments({ store_id: storeId }),
            Order.countDocuments({
                store_id: storeId,
                created_at: { $gte: currentStart, $lte: currentEnd }
            }),
            User.countDocuments({ store_id: storeId }),

            // Current revenue
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                { $group: { _id: null, total: { $sum: "$total" } } },
            ]),

            Order.countDocuments({
                store_id: storeId,
                status: "pending",
                created_at: { $gte: currentStart, $lte: currentEnd }
            }),

            Product.countDocuments({
                store_id: storeId,
                "stock.quantity": { $lte: 5, $gt: 0 }
            }),
            Product.countDocuments({
                store_id: storeId,
                "stock.quantity": { $lte: 0 }
            }),

            // Previous period data
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: previousRange.start, $lte: previousRange.end },
                    },
                },
                { $group: { _id: null, total: { $sum: "$total" } } },
            ]),
            Order.countDocuments({
                store_id: storeId,
                created_at: { $gte: previousRange.start, $lte: previousRange.end }
            }),
            User.countDocuments({
                store_id: storeId,
                created_at: { $gte: previousRange.start, $lte: previousRange.end }
            }),

            // Revenue trend
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
                        },
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        average_order_value: { $avg: "$total" }
                    }
                },
                { $sort: { _id: 1 } },
                {
                    $project: {
                        date: "$_id",
                        revenue: 1,
                        orders: 1,
                        average_order_value: 1,
                        _id: 0
                    }
                }
            ]),

            // New customers
            User.countDocuments({
                store_id: storeId,
                created_at: { $gte: currentStart, $lte: currentEnd }
            }),

            // Customer segments
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        totalSpent: { $sum: "$total" },
                        orderCount: { $sum: 1 },
                        firstOrderDate: { $min: "$created_at" },
                        lastOrderDate: { $max: "$created_at" }
                    }
                },
                {
                    $bucket: {
                        groupBy: "$totalSpent",
                        boundaries: [0, 100, 500, 1000, 5000, Infinity],
                        default: "VIP",
                        output: {
                            count: { $sum: 1 },
                            totalRevenue: { $sum: "$totalSpent" },
                            averageOrders: { $avg: "$orderCount" },
                            customers: {
                                $push: {
                                    user_id: "$_id",
                                    total_spent: "$totalSpent",
                                    order_count: "$orderCount"
                                }
                            }
                        }
                    }
                }
            ]),

            // Top selling products
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: "$items.product_id",
                        totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                        totalSales: { $sum: "$items.quantity" },
                        averagePrice: { $avg: "$items.price" },
                        productName: { $first: "$items.product_name" }
                    }
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: 10 },
                {
                    $project: {
                        product_id: "$_id",
                        name: "$productName",
                        revenue: "$totalRevenue",
                        sales: "$totalSales",
                        average_price: "$averagePrice",
                        _id: 0
                    }
                }
            ]),

            // Low stock products
            Product.find({
                store_id: storeId,
                "stock.quantity": { $lte: 10 }
            })
                .select("name stock.quantity price sku")
                .limit(10)
                .lean(),

            // Geographic data - Country level
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$shipping_address.country",
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        customers: { $addToSet: "$user_id" },
                        average_order_value: { $avg: "$total" }
                    }
                },
                { $sort: { revenue: -1 } },
                {
                    $project: {
                        country: "$_id",
                        revenue: 1,
                        orders: 1,
                        customer_count: { $size: "$customers" },
                        average_order_value: 1,
                        _id: 0
                    }
                }
            ]),

            // Geographic data - State level
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            country: "$shipping_address.country",
                            state: "$shipping_address.state"
                        },
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        customers: { $addToSet: "$user_id" },
                        cities: { $addToSet: "$shipping_address.city" }
                    }
                },
                { $sort: { revenue: -1 } },
                { $limit: 20 },
                {
                    $project: {
                        country: "$_id.country",
                        state: "$_id.state",
                        revenue: 1,
                        orders: 1,
                        customer_count: { $size: "$customers" },
                        city_count: { $size: "$cities" },
                        _id: 0
                    }
                }
            ]),

            // Geographic data - City level
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            country: "$shipping_address.country",
                            state: "$shipping_address.state",
                            city: "$shipping_address.city"
                        },
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        customers: { $addToSet: "$user_id" },
                        postal_codes: { $addToSet: "$shipping_address.postal_code" }
                    }
                },
                { $sort: { revenue: -1 } },
                { $limit: 30 },
                {
                    $project: {
                        country: "$_id.country",
                        state: "$_id.state",
                        city: "$_id.city",
                        revenue: 1,
                        orders: 1,
                        customer_count: { $size: "$customers" },
                        postal_code_count: { $size: "$postal_codes" },
                        _id: 0
                    }
                }
            ]),

            // Conversion funnel data
            Promise.all([
                ProductView.countDocuments({
                    store_id: storeId,
                    created_at: { $gte: currentStart, $lte: currentEnd }
                }),
                CartEvent.countDocuments({
                    store_id: storeId,
                    action: "add",
                    created_at: { $gte: currentStart, $lte: currentEnd }
                }),
                Order.countDocuments({
                    store_id: storeId,
                    status: { $in: ["completed", "delivered", "paid"] },
                    created_at: { $gte: currentStart, $lte: currentEnd }
                })
            ]),

            // Session and user behavior
            SessionTracking.aggregate([
                {
                    $match: {
                        store_id: storeId,
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalSessions: { $sum: 1 },
                        averageSessionDuration: { $avg: "$session_duration" },
                        bounceRate: {
                            $avg: {
                                $cond: [{ $eq: ["$is_bounce", true] }, 1, 0]
                            }
                        },
                        uniqueVisitors: { $addToSet: "$user_id" },
                        pagesPerSession: { $avg: { $size: "$pages_visited" } }
                    }
                },
                {
                    $project: {
                        total_sessions: "$totalSessions",
                        average_session_duration: "$averageSessionDuration",
                        bounce_rate: { $multiply: ["$bounceRate", 100] },
                        unique_visitors: { $size: "$uniqueVisitors" },
                        pages_per_session: "$pagesPerSession",
                        _id: 0
                    }
                }
            ]),

            // Traffic sources
            SessionTracking.aggregate([
                {
                    $match: {
                        store_id: storeId,
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $ne: ["$utm_params.source", null] },
                                "$utm_params.source",
                                {
                                    $cond: [
                                        { $ne: ["$referrer", null] },
                                        "referral",
                                        "direct"
                                    ]
                                }
                            ]
                        },
                        sessions: { $sum: 1 },
                        conversions: {
                            $sum: {
                                $size: {
                                    $filter: {
                                        input: "$conversion_events",
                                        as: "event",
                                        cond: { $eq: ["$$event.event_type", "purchase"] }
                                    }
                                }
                            }
                        },
                        averageDuration: { $avg: "$session_duration" }
                    }
                },
                {
                    $project: {
                        source: "$_id",
                        sessions: 1,
                        conversions: 1,
                        conversion_rate: {
                            $cond: [
                                { $gt: ["$sessions", 0] },
                                { $multiply: [{ $divide: ["$conversions", "$sessions"] }, 100] },
                                0
                            ]
                        },
                        average_duration: "$averageDuration",
                        _id: 0
                    }
                }
            ]),

            // Product views and engagement
            ProductView.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$product_id",
                        total_views: { $sum: 1 },
                        average_duration: { $avg: "$view_duration" },
                        average_scroll_depth: { $avg: "$scroll_depth" },
                        unique_viewers: { $addToSet: "$user_id" }
                    }
                },
                { $sort: { total_views: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $project: {
                        product_id: "$_id",
                        product_name: "$product.name",
                        total_views: 1,
                        average_duration: 1,
                        average_scroll_depth: 1,
                        unique_viewers: { $size: "$unique_viewers" },
                        _id: 0
                    }
                }
            ]),

            // Cart additions and behavior
            CartEvent.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        action: "add",
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$product_id",
                        total_adds: { $sum: 1 },
                        total_quantity: { $sum: "$quantity" },
                        average_price: { $avg: "$price" },
                        unique_users: { $addToSet: "$user_id" }
                    }
                },
                { $sort: { total_adds: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $project: {
                        product_id: "$_id",
                        product_name: "$product.name",
                        total_adds: 1,
                        total_quantity: 1,
                        average_price: 1,
                        unique_users: { $size: "$unique_users" },
                        _id: 0
                    }
                }
            ]),

            // Returning customers
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        orderCount: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        orderCount: { $gt: 1 }
                    }
                },
                { $count: "returningCustomers" }
            ]),

            // Customer acquisition channels
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$provider",
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        channel: "$_id",
                        count: 1,
                        _id: 0
                    }
                }
            ])
        ]);

        // Calculate growth percentages
        const currentRev = monthlyRevenue[0]?.total || 0;
        const prevRev = previousRevenue[0]?.total || 0;
        const revenueGrowth = prevRev > 0 ? ((currentRev - prevRev) / prevRev) * 100 : currentRev > 0 ? 100 : 0;

        const orderGrowth = previousOrders > 0 ?
            ((totalOrders - previousOrders) / previousOrders) * 100 : totalOrders > 0 ? 100 : 0;

        const customerGrowth = previousCustomers > 0 ?
            ((totalCustomers - previousCustomers) / previousCustomers) * 100 : totalCustomers > 0 ? 100 : 0;

        // Format conversion funnel data
        const [productViewsCount, cartAddsCount, purchasesCount] = conversionData;
        const funnelStages = [
            {
                stage: "Product Views",
                count: productViewsCount,
                conversion_rate: 100
            },
            {
                stage: "Add to Cart",
                count: cartAddsCount,
                conversion_rate: productViewsCount > 0 ? (cartAddsCount / productViewsCount) * 100 : 0
            },
            {
                stage: "Purchases",
                count: purchasesCount,
                conversion_rate: cartAddsCount > 0 ? (purchasesCount / cartAddsCount) * 100 : 0
            }
        ];

        const overallConversionRate = productViewsCount > 0 ?
            (purchasesCount / productViewsCount) * 100 : 0;

        // Session data
        const sessionMetrics = sessionData[0] || {
            total_sessions: 0,
            average_session_duration: 0,
            bounce_rate: 0,
            unique_visitors: 0,
            pages_per_session: 0
        };

        const dashboard = {
            overview: {
                monthlyRevenue: currentRev,
                totalOrders,
                totalCustomers,
                pendingOrders,
                overallConversionRate: Math.round(overallConversionRate * 100) / 100
            },
            growth: {
                revenue: {
                    value: currentRev,
                    growth: Math.round(revenueGrowth * 100) / 100,
                    trend: revenueTrend
                },
                orders: {
                    value: totalOrders,
                    growth: Math.round(orderGrowth * 100) / 100
                },
                customers: {
                    value: totalCustomers,
                    growth: Math.round(customerGrowth * 100) / 100,
                    new: newCustomers
                }
            },
            products: {
                total: totalProducts,
                lowStock: lowStockCount,
                outOfStock: outOfStockCount,
                topSelling: topSellingProducts,
                lowStockProducts: lowStockProducts,
                mostViewed: productViews,
                mostAddedToCart: cartAdditions
            },
            conversion: {
                funnel: funnelStages,
                overallRate: Math.round(overallConversionRate * 100) / 100
            },
            geographic: {
                byCountry: geographicSalesByCountry,
                byState: geographicSalesByState,
                byCity: geographicSalesByCity
            },
            traffic: {
                sessions: sessionMetrics,
                sources: trafficSources
            },
            customers: {
                segments: customerSegments,
                returning: returningCustomers[0]?.returningCustomers || 0,
                acquisition: customerAcquisition
            },
            inventory: {
                lowStockCount,
                outOfStockCount,
                alert: lowStockCount + outOfStockCount > 0
            },
            performance: {
                averageOrderValue: totalOrders > 0 ? currentRev / totalOrders : 0,
                customerLifetimeValue: totalCustomers > 0 ? currentRev / totalCustomers : 0
            }
        };

        return reply.code(200).send({
            success: true,
            data: dashboard,
            message: "Store dashboard data fetched successfully"
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        return reply.code(500).send({
            success: false,
            data: {},
            message: "Error fetching store dashboard"
        });
    }
};

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
