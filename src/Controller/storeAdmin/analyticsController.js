import { User } from "../../Models/userModel.js";
import { Product } from "../../Models/productModel.js";
import { Order } from "../../Models/orderModel.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import mongoose from "mongoose";
import { ProductView } from "../../Models/productViewModel.js";
import { CartEvent } from "../../Models/cartEventModel.js";
import { SessionTracking } from "../../Models/sessionTrackingModel.js";
import { WishlistEvent } from "../../Models/wishlistEventModel.js";
import { Payment } from "../../Models/paymentModel.js";

// Enhanced Store Dashboard Summary
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
            customerAcquisition,

            // Recent activity
            recentOrders,
            topRatedProducts,

            // Payment analytics
            paymentStats,

            // Category stats
            categoryStats
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
                .select("name stock.quantity price sku images")
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
                        store_id: new mongoose.Types.ObjectId(storeId),
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
                        store_id: new mongoose.Types.ObjectId(storeId),
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
            ]),

            // Recent orders for activity feed
            Order.find({
                store_id: storeId,
                created_at: { $gte: currentStart, $lte: currentEnd }
            })
                .sort({ created_at: -1 })
                .limit(10)
                .populate("user_id", "name email")
                .select("order_number total user_id status created_at"),

            // Top rated products
            Product.find({
                store_id: storeId,
                "ratings.average": { $gte: 4 }
            })
                .sort({ "ratings.average": -1, "ratings.count": -1 })
                .limit(10)
                .select("name price images ratings")
                .lean(),

            // Payment statistics
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: currentStart, $lte: currentEnd },
                    },
                },
                {
                    $group: {
                        _id: "$payment_status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$total" },
                    },
                },
            ]),

            // Category statistics
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
                    $lookup: {
                        from: "products",
                        localField: "items.product_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "categories",
                        localField: "product.parent_category",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: "$category" },
                {
                    $group: {
                        _id: "$category.name",
                        revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        orders: { $sum: 1 },
                        products: { $addToSet: "$items.product_id" }
                    }
                },
                {
                    $project: {
                        category: "$_id",
                        revenue: 1,
                        orders: 1,
                        product_count: { $size: "$products" },
                        _id: 0
                    }
                },
                { $sort: { revenue: -1 } }
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
                alert: lowStockCount + outOfStockCount > 0,
                totalProducts
            },
            performance: {
                averageOrderValue: totalOrders > 0 ? currentRev / totalOrders : 0,
                customerLifetimeValue: totalCustomers > 0 ? currentRev / totalCustomers : 0
            },
            recentActivity: {
                recentOrders,
                topProducts: topRatedProducts
            },
            sales: {
                paymentStats,
                categoryStats
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

// Enhanced Store Sales Analytics
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

        const [salesTrend, totalSales, orderStats, paymentStats, categoryStats, hourlySales, customerLifetimeValue] = await Promise.all([
            // Daily sales trend with more metrics
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        averageOrderValue: { $avg: "$total" },
                        customers: { $addToSet: "$user_id" }
                    },
                },
                {
                    $project: {
                        date: "$_id",
                        revenue: 1,
                        orders: 1,
                        averageOrderValue: 1,
                        uniqueCustomers: { $size: "$customers" },
                        _id: 0
                    }
                },
                { $sort: { date: 1 } },
            ]),
            // Total sales summary with enhanced metrics
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$total" },
                        totalOrders: { $sum: 1 },
                        averageOrderValue: { $avg: "$total" },
                        maxOrderValue: { $max: "$total" },
                        minOrderValue: { $min: "$total" },
                        uniqueCustomers: { $addToSet: "$user_id" }
                    },
                },
                {
                    $project: {
                        totalRevenue: 1,
                        totalOrders: 1,
                        averageOrderValue: 1,
                        maxOrderValue: 1,
                        minOrderValue: 1,
                        uniqueCustomerCount: { $size: "$uniqueCustomers" }
                    }
                }
            ]),
            // Enhanced order status breakdown
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$total" },
                        averageValue: { $avg: "$total" },
                        customers: { $addToSet: "$user_id" }
                    },
                },
                {
                    $project: {
                        status: "$_id",
                        count: 1,
                        revenue: 1,
                        averageValue: 1,
                        uniqueCustomers: { $size: "$customers" },
                        _id: 0
                    }
                }
            ]),
            // Enhanced payment statistics
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: "$payment_status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$total" },
                        averageValue: { $avg: "$total" },
                    },
                },
                {
                    $project: {
                        paymentMethod: "$_id",
                        count: 1,
                        revenue: 1,
                        averageValue: 1,
                        _id: 0
                    }
                }
            ]),
            // Sales by category with enhanced metrics
            Order.aggregate([
                { $match: dateFilter },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.product_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "categories",
                        localField: "product.parent_category",
                        foreignField: "_id",
                        as: "category"
                    }
                },
                { $unwind: "$category" },
                {
                    $group: {
                        _id: "$category.name",
                        revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        orders: { $sum: 1 },
                        productsSold: { $sum: "$items.quantity" },
                        averagePrice: { $avg: "$items.price" },
                        uniqueProducts: { $addToSet: "$items.product_id" }
                    },
                },
                {
                    $project: {
                        category: "$_id",
                        revenue: 1,
                        orders: 1,
                        productsSold: 1,
                        averagePrice: 1,
                        uniqueProductCount: { $size: "$uniqueProducts" },
                        _id: 0
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            // Hourly sales pattern
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: { $hour: "$created_at" },
                        revenue: { $sum: "$total" },
                        orders: { $sum: 1 },
                        averageOrderValue: { $avg: "$total" }
                    },
                },
                {
                    $project: {
                        hour: "$_id",
                        revenue: 1,
                        orders: 1,
                        averageOrderValue: 1,
                        _id: 0
                    }
                },
                { $sort: { hour: 1 } }
            ]),
            // Customer lifetime value analysis
            Order.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: "$user_id",
                        totalSpent: { $sum: "$total" },
                        orderCount: { $sum: 1 },
                        firstOrderDate: { $min: "$created_at" },
                        lastOrderDate: { $max: "$created_at" }
                    },
                },
                {
                    $group: {
                        _id: null,
                        avgLifetimeValue: { $avg: "$totalSpent" },
                        avgOrdersPerCustomer: { $avg: "$orderCount" },
                        totalCustomers: { $sum: 1 },
                        topSpender: { $max: "$totalSpent" }
                    },
                }
            ])
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    salesTrend,
                    summary: totalSales[0] || {
                        totalRevenue: 0,
                        totalOrders: 0,
                        averageOrderValue: 0,
                        maxOrderValue: 0,
                        minOrderValue: 0,
                        uniqueCustomerCount: 0
                    },
                    orderStats,
                    paymentStats,
                    categoryStats,
                    hourlySales,
                    customerLifetimeValue: customerLifetimeValue[0] || {}
                },
                "Store sales analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store sales analytics"))
    }
}

// Enhanced Top Selling Products Analytics
const getTopSellingProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { limit = 10, period = "30", category } = request.query

        const days = Number.parseInt(period)
        const since = new Date()
        since.setDate(since.getDate() - days)

        const matchStage = {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
            status: { $in: ["completed", "delivered", "paid"] },
        }

        // Add category filter if provided
        if (category) {
            matchStage["items.product.category"] = category
        }

        const [topProducts, productPerformance, categoryPerformance, priceSegmentAnalysis] = await Promise.all([
            // Top selling products with enhanced metrics
            Order.aggregate([
                {
                    $match: matchStage,
                },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.product_id",
                        foreignField: "_id",
                        as: "product",
                    },
                },
                { $unwind: "$product" },
                {
                    $group: {
                        _id: "$items.product_id",
                        totalSold: { $sum: "$items.quantity" },
                        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        orderCount: { $sum: 1 },
                        averagePrice: { $avg: "$items.price" },
                        productName: { $first: "$product.name" },
                        productImage: { $first: { $arrayElemAt: ["$product.images", 0] } },
                        productPrice: { $first: "$product.price" },
                        productCategory: { $first: "$product.parent_category" },
                        ratings: { $first: "$product.ratings" }
                    },
                },
                { $sort: { totalSold: -1 } },
                { $limit: Number.parseInt(limit) },
                {
                    $project: {
                        productId: "$_id",
                        productName: 1,
                        productImage: 1,
                        price: "$productPrice",
                        totalSold: 1,
                        totalRevenue: 1,
                        orderCount: 1,
                        averagePrice: 1,
                        ratings: 1,
                        profitMargin: { $multiply: ["$totalRevenue", 0.3] } // Assuming 30% margin
                    },
                },
            ]),
            // Product performance metrics
            Order.aggregate([
                {
                    $match: matchStage,
                },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "productviews",
                        localField: "items.product_id",
                        foreignField: "product_id",
                        as: "views",
                    },
                },
                {
                    $lookup: {
                        from: "cartevents",
                        localField: "items.product_id",
                        foreignField: "product_id",
                        as: "cartAdds",
                        pipeline: [{
                            $match: {
                                action: "add",
                                created_at: { $gte: since }
                            }
                        }]
                    },
                },
                {
                    $group: {
                        _id: "$items.product_id",
                        totalSold: { $sum: "$items.quantity" },
                        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        viewCount: { $sum: { $size: "$views" } },
                        cartAddCount: { $sum: { $size: "$cartAdds" } },
                        uniqueCustomers: { $addToSet: "$user_id" }
                    },
                },
                {
                    $project: {
                        productId: "$_id",
                        totalSold: 1,
                        totalRevenue: 1,
                        viewCount: 1,
                        cartAddCount: 1,
                        conversionRate: {
                            $cond: [
                                { $gt: ["$viewCount", 0] },
                                { $multiply: [{ $divide: ["$totalSold", "$viewCount"] }, 100] },
                                0
                            ]
                        },
                        cartToPurchaseRate: {
                            $cond: [
                                { $gt: ["$cartAddCount", 0] },
                                { $multiply: [{ $divide: ["$totalSold", "$cartAddCount"] }, 100] },
                                0
                            ]
                        },
                        uniqueCustomerCount: { $size: "$uniqueCustomers" }
                    },
                },
                { $sort: { totalRevenue: -1 } },
                { $limit: Number.parseInt(limit) }
            ]),
            // Category performance
            Order.aggregate([
                {
                    $match: matchStage,
                },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.product_id",
                        foreignField: "_id",
                        as: "product",
                    },
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "categories",
                        localField: "product.parent_category",
                        foreignField: "_id",
                        as: "category",
                    },
                },
                { $unwind: "$category" },
                {
                    $group: {
                        _id: "$category.name",
                        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        totalSold: { $sum: "$items.quantity" },
                        orderCount: { $sum: 1 },
                        averageOrderValue: { $avg: "$total" },
                        uniqueProducts: { $addToSet: "$items.product_id" },
                        uniqueCustomers: { $addToSet: "$user_id" }
                    },
                },
                {
                    $project: {
                        category: "$_id",
                        totalRevenue: 1,
                        totalSold: 1,
                        orderCount: 1,
                        averageOrderValue: 1,
                        uniqueProductCount: { $size: "$uniqueProducts" },
                        uniqueCustomerCount: { $size: "$uniqueCustomers" },
                        revenuePerProduct: { $divide: ["$totalRevenue", { $size: "$uniqueProducts" }] }
                    },
                },
                { $sort: { totalRevenue: -1 } }
            ]),
            // Price segment analysis
            Order.aggregate([
                {
                    $match: matchStage,
                },
                { $unwind: "$items" },
                {
                    $bucket: {
                        groupBy: "$items.price",
                        boundaries: [0, 25, 50, 100, 200, 500, 1000, Infinity],
                        default: "Premium",
                        output: {
                            count: { $sum: 1 },
                            totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                            totalSold: { $sum: "$items.quantity" },
                            products: { $addToSet: "$items.product_id" }
                        }
                    }
                },
                {
                    $project: {
                        priceRange: "$_id",
                        count: 1,
                        totalRevenue: 1,
                        totalSold: 1,
                        averagePrice: { $divide: ["$totalRevenue", "$totalSold"] },
                        uniqueProducts: { $size: "$products" },
                        _id: 0
                    }
                },
                { $sort: { totalRevenue: -1 } }
            ])
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    topProducts,
                    performance: productPerformance,
                    categories: categoryPerformance,
                    priceSegments: priceSegmentAnalysis
                },
                "Top selling products analytics fetched successfully"
            )
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching top selling products analytics"))
    }
}

// Enhanced Customer Analytics
const getCustomerAnalytics = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { period = "30" } = request.query

        const days = Number.parseInt(period)
        const since = new Date()
        since.setDate(since.getDate() - days)

        const [customerGrowth, topCustomers, customerStats, customerRetention, customerDemographics, customerBehavior, acquisitionChannels] = await Promise.all([
            // Enhanced customer registration trend
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                        newCustomers: { $sum: 1 },
                        verifiedCustomers: {
                            $sum: { $cond: [{ $eq: ["$email_verified", true] }, 1, 0] }
                        }
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            // Enhanced top customers by order value
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                        status: { $in: ["completed", "delivered", "paid"] },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        totalSpent: { $sum: "$total" },
                        orderCount: { $sum: 1 },
                        lastOrderDate: { $max: "$created_at" },
                        firstOrderDate: { $min: "$created_at" },
                        averageOrderValue: { $avg: "$total" }
                    },
                },
                { $sort: { totalSpent: -1 } },
                { $limit: 20 },
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
                        customerPhone: "$customer.phone_number",
                        totalSpent: 1,
                        orderCount: 1,
                        lastOrderDate: 1,
                        firstOrderDate: 1,
                        averageOrderValue: 1,
                        customerSince: "$customer.created_at",
                        daysSinceLastOrder: {
                            $divide: [
                                { $subtract: [new Date(), "$lastOrderDate"] },
                                86400000
                            ]
                        }
                    },
                },
            ]),
            // Enhanced customer statistics
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        activeCustomers: {
                            $sum: {
                                $cond: [{ $gte: ["$last_login", since] }, 1, 0],
                            },
                        },
                        verifiedCustomers: {
                            $sum: {
                                $cond: [{ $eq: ["$email_verified", true] }, 1, 0],
                            },
                        },
                        newCustomers: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $gte: ["$created_at", since] },
                                            { $lte: ["$created_at", new Date()] }
                                        ]
                                    }, 1, 0
                                ],
                            },
                        }
                    },
                },
            ]),
            // Enhanced customer retention (repeat customers)
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
                        totalSpent: { $sum: "$total" },
                        firstOrderDate: { $min: "$created_at" },
                        lastOrderDate: { $max: "$created_at" }
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalCustomers: { $sum: 1 },
                        repeatCustomers: {
                            $sum: { $cond: [{ $gt: ["$orderCount", 1] }, 1, 0] },
                        },
                        vipCustomers: {
                            $sum: { $cond: [{ $gt: ["$totalSpent", 1000] }, 1, 0] },
                        },
                        averageOrdersPerCustomer: { $avg: "$orderCount" },
                        averageCustomerValue: { $avg: "$totalSpent" }
                    },
                },
                {
                    $project: {
                        totalCustomers: 1,
                        repeatCustomers: 1,
                        vipCustomers: 1,
                        retentionRate: {
                            $multiply: [{ $divide: ["$repeatCustomers", "$totalCustomers"] }, 100],
                        },
                        averageOrdersPerCustomer: 1,
                        averageCustomerValue: 1
                    },
                },
            ]),
            // Customer demographics
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                    },
                },
                { $unwind: { path: "$address", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: "$address.country",
                        customerCount: { $sum: 1 },
                        totalSpent: {
                            $sum: {
                                $let: {
                                    vars: {
                                        userOrders: {
                                            $filter: {
                                                input: "$orders",
                                                as: "order",
                                                cond: { $eq: ["$$order.status", "completed"] }
                                            }
                                        }
                                    },
                                    in: { $sum: "$$userOrders.total" }
                                }
                            }
                        }
                    },
                },
                { $sort: { customerCount: -1 } },
                { $limit: 10 },
                {
                    $project: {
                        country: "$_id",
                        customerCount: 1,
                        totalSpent: 1,
                        averageSpent: { $divide: ["$totalSpent", "$customerCount"] },
                        _id: 0
                    }
                }
            ]),
            // Customer behavior analysis
            SessionTracking.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: "$user_id",
                        totalSessions: { $sum: 1 },
                        totalDuration: { $sum: "$session_duration" },
                        pageViews: { $sum: { $size: "$pages_visited" } },
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
                        devices: { $addToSet: "$device_info.type" }
                    },
                },
                {
                    $project: {
                        userId: "$_id",
                        totalSessions: 1,
                        averageSessionDuration: { $divide: ["$totalDuration", "$totalSessions"] },
                        averagePagesPerSession: { $divide: ["$pageViews", "$totalSessions"] },
                        conversionRate: { $multiply: [{ $divide: ["$conversions", "$totalSessions"] }, 100] },
                        deviceCount: { $size: "$devices" },
                        _id: 0
                    }
                },
                { $sort: { totalSessions: -1 } },
                { $limit: 50 }
            ]),
            // Customer acquisition channels
            User.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: { $gte: since },
                    },
                },
                {
                    $group: {
                        _id: "$provider",
                        count: { $sum: 1 },
                        verifiedCount: {
                            $sum: { $cond: [{ $eq: ["$email_verified", true] }, 1, 0] }
                        },
                        activeCount: {
                            $sum: { $cond: [{ $gte: ["$last_login", since] }, 1, 0] }
                        }
                    },
                },
                {
                    $project: {
                        channel: "$_id",
                        count: 1,
                        verifiedCount: 1,
                        activeCount: 1,
                        verificationRate: { $multiply: [{ $divide: ["$verifiedCount", "$count"] }, 100] },
                        activationRate: { $multiply: [{ $divide: ["$activeCount", "$count"] }, 100] },
                        _id: 0
                    }
                }
            ])
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    customerGrowth,
                    topCustomers,
                    stats: customerStats[0] || {
                        totalCustomers: 0,
                        activeCustomers: 0,
                        verifiedCustomers: 0,
                        newCustomers: 0
                    },
                    retention: customerRetention[0] || {
                        totalCustomers: 0,
                        repeatCustomers: 0,
                        vipCustomers: 0,
                        retentionRate: 0,
                        averageOrdersPerCustomer: 0,
                        averageCustomerValue: 0
                    },
                    demographics: customerDemographics,
                    behavior: customerBehavior,
                    acquisition: acquisitionChannels
                },
                "Customer analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customer analytics"))
    }
}

// Enhanced Inventory Analytics
const getInventoryAnalytics = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const [inventoryStatus, categoryBreakdown, stockMovement, topSellingByCategory, inventoryHealth, stockAlerts] = await Promise.all([
            // Enhanced inventory status summary
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
                                $cond: [
                                    {
                                        $and: [
                                            { $lte: ["$stock.quantity", "$stock.low_stock_threshold"] },
                                            { $gt: ["$stock.quantity", 0] }
                                        ]
                                    }, 1, 0],
                            },
                        },
                        outOfStock: {
                            $sum: {
                                $cond: [{ $lte: ["$stock.quantity", 0] }, 1, 0],
                            },
                        },
                        healthyStock: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $gt: ["$stock.quantity", "$stock.low_stock_threshold"] },
                                            { $ne: ["$stock.low_stock_threshold", null] }
                                        ]
                                    }, 1, 0],
                            },
                        },
                        averagePrice: { $avg: "$price" },
                        averageRating: { $avg: "$ratings.average" },
                        averageStock: { $avg: "$stock.quantity" },
                        totalInventoryValue: { $sum: { $multiply: ["$stock.quantity", "$price"] } }
                    },
                },
            ]),
            // Enhanced products by category
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
                        lowStockCount: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $lte: ["$stock.quantity", "$stock.low_stock_threshold"] },
                                            { $gt: ["$stock.quantity", 0] }
                                        ]
                                    }, 1, 0],
                            },
                        },
                        outOfStockCount: {
                            $sum: {
                                $cond: [{ $lte: ["$stock.quantity", 0] }, 1, 0],
                            },
                        },
                        averageRating: { $avg: "$ratings.average" }
                    },
                },
                {
                    $project: {
                        category: "$_id",
                        productCount: 1,
                        totalStock: 1,
                        averagePrice: 1,
                        totalValue: 1,
                        lowStockCount: 1,
                        outOfStockCount: 1,
                        healthyStockCount: {
                            $subtract: [
                                "$productCount",
                                { $add: ["$lowStockCount", "$outOfStockCount"] }
                            ]
                        },
                        stockHealthPercentage: {
                            $multiply: [
                                {
                                    $divide: [
                                        { $subtract: ["$productCount", { $add: ["$lowStockCount", "$outOfStockCount"] }] },
                                        "$productCount"
                                    ]
                                },
                                100
                            ]
                        },
                        averageRating: 1,
                        _id: 0
                    }
                },
                { $sort: { productCount: -1 } },
            ]),
            // Enhanced recent stock changes
            Product.find({ store_id: storeId })
                .sort({ updated_at: -1 })
                .limit(15)
                .select("name stock.quantity stock.low_stock_threshold price updated_at images ratings")
                .populate("parent_category", "name"),
            // Enhanced top selling products by category
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        status: { $in: ["completed", "delivered", "paid"] },
                        created_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
                    },
                },
                { $unwind: "$items" },
                {
                    $lookup: {
                        from: "products",
                        localField: "items.product_id",
                        foreignField: "_id",
                        as: "product",
                    },
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "categories",
                        localField: "product.parent_category",
                        foreignField: "_id",
                        as: "category",
                    },
                },
                { $unwind: "$category" },
                {
                    $group: {
                        _id: "$category.name",
                        totalRevenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
                        totalSold: { $sum: "$items.quantity" },
                        topProducts: {
                            $push: {
                                productId: "$items.product_id",
                                productName: "$product.name",
                                revenue: { $multiply: ["$items.quantity", "$items.price"] },
                                quantity: "$items.quantity",
                                price: "$items.price",
                                stock: "$product.stock.quantity",
                                lowStockThreshold: "$product.stock.low_stock_threshold"
                            }
                        }
                    },
                },
                {
                    $project: {
                        categoryName: "$_id",
                        totalRevenue: 1,
                        totalSold: 1,
                        topProducts: {
                            $slice: [
                                {
                                    $sortArray: {
                                        input: "$topProducts",
                                        sortBy: { revenue: -1 }
                                    }
                                },
                                3
                            ]
                        },
                        _id: 0
                    },
                },
            ]),
            // Inventory health analysis
            Product.aggregate([
                { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
                {
                    $bucket: {
                        groupBy: "$stock.quantity",
                        boundaries: [0, 1, 5, 10, 20, 50, 100, Infinity],
                        default: "High",
                        output: {
                            count: { $sum: 1 },
                            totalValue: { $sum: { $multiply: ["$stock.quantity", "$price"] } },
                            products: {
                                $push: {
                                    name: "$name",
                                    stock: "$stock.quantity",
                                    price: "$price",
                                    lowStockThreshold: "$stock.low_stock_threshold"
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        stockLevel: "$_id",
                        count: 1,
                        totalValue: 1,
                        productCount: { $size: "$products" },
                        _id: 0
                    }
                },
                { $sort: { stockLevel: 1 } }
            ]),
            // Critical stock alerts - FIXED VERSION
            Product.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        $or: [
                            { "stock.quantity": { $lte: 0 } },
                            {
                                $expr: {
                                    $and: [
                                        { $gt: ["$stock.quantity", 0] },
                                        {
                                            $lte: [
                                                "$stock.quantity",
                                                { $ifNull: ["$stock.low_stock_threshold", 5] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                },
                {
                    $lookup: {
                        from: "categories",
                        localField: "parent_category",
                        foreignField: "_id",
                        as: "parent_category"
                    }
                },
                { $unwind: { path: "$parent_category", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        name: 1,
                        "stock.quantity": 1,
                        "stock.low_stock_threshold": 1,
                        price: 1,
                        sku: 1,
                        images: 1,
                        "parent_category.name": 1
                    }
                },
                { $sort: { "stock.quantity": 1 } },
                { $limit: 20 }
            ])
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
                        healthyStock: 0,
                        averagePrice: 0,
                        averageRating: 0,
                        averageStock: 0,
                        totalInventoryValue: 0
                    },
                    categoryBreakdown,
                    recentUpdates: stockMovement,
                    topSellingByCategory,
                    inventoryHealth,
                    stockAlerts
                },
                "Inventory analytics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching inventory analytics"))
    }
}
// New: Get Comprehensive Analytics Insights
const getAnalyticsInsights = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { period = "30" } = request.query

        const days = Number.parseInt(period)
        const since = new Date()
        since.setDate(since.getDate() - days)

        const [performanceSummary, businessHealth, growthOpportunities, riskAlerts] = await Promise.all([
            // Performance summary compared to previous period
            Order.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        created_at: {
                            $gte: new Date(since.getTime() - days * 24 * 60 * 60 * 1000),
                            $lte: new Date()
                        }
                    }
                },
                {
                    $facet: {
                        currentPeriod: [
                            {
                                $match: {
                                    created_at: { $gte: since }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    revenue: { $sum: "$total" },
                                    orders: { $sum: 1 },
                                    customers: { $addToSet: "$user_id" },
                                    averageOrderValue: { $avg: "$total" }
                                }
                            }
                        ],
                        previousPeriod: [
                            {
                                $match: {
                                    created_at: {
                                        $gte: new Date(since.getTime() - days * 24 * 60 * 60 * 1000),
                                        $lt: since
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: null,
                                    revenue: { $sum: "$total" },
                                    orders: { $sum: 1 },
                                    customers: { $addToSet: "$user_id" },
                                    averageOrderValue: { $avg: "$total" }
                                }
                            }
                        ]
                    }
                }
            ]),
            // Business health metrics
            Promise.all([
                Product.countDocuments({
                    store_id: storeId,
                    "stock.quantity": { $lte: 0 }
                }),
                Order.countDocuments({
                    store_id: storeId,
                    status: "pending"
                }),
                User.countDocuments({
                    store_id: storeId,
                    last_login: { $gte: since }
                }),
                ProductView.countDocuments({
                    store_id: storeId,
                    created_at: { $gte: since }
                })
            ]),
            // Growth opportunities
            Product.aggregate([
                {
                    $match: {
                        store_id: new mongoose.Types.ObjectId(storeId),
                        "ratings.average": { $gte: 4 },
                        "stock.quantity": { $gt: 0 }
                    }
                },
                {
                    $lookup: {
                        from: "orders",
                        localField: "_id",
                        foreignField: "items.product_id",
                        as: "orders"
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        ratings: 1,
                        stock: 1,
                        orderCount: { $size: "$orders" },
                        potential: {
                            $multiply: [
                                "$price",
                                { $subtract: ["$stock.quantity", 10] }
                            ]
                        }
                    }
                },
                {
                    $match: {
                        orderCount: { $lt: 50 },
                        potential: { $gt: 0 }
                    }
                },
                { $sort: { "ratings.average": -1, potential: -1 } },
                { $limit: 10 }
            ]),
            // Risk alerts
            Promise.all([
                Product.countDocuments({
                    store_id: storeId,
                    "stock.quantity": { $lte: 0 }
                }),
                Order.countDocuments({
                    store_id: storeId,
                    status: "cancelled",
                    created_at: { $gte: since }
                }),
                Product.countDocuments({
                    store_id: storeId,
                    "ratings.average": { $lt: 2 }
                })
            ])
        ])

        const current = performanceSummary[0]?.currentPeriod[0] || {
            revenue: 0,
            orders: 0,
            customers: 0,
            averageOrderValue: 0
        }
        const previous = performanceSummary[0]?.previousPeriod[0] || {
            revenue: 0,
            orders: 0,
            customers: 0,
            averageOrderValue: 0
        }

        const insights = {
            performance: {
                revenue: {
                    current: current.revenue,
                    previous: previous.revenue,
                    growth: previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0
                },
                orders: {
                    current: current.orders,
                    previous: previous.orders,
                    growth: previous.orders > 0 ? ((current.orders - previous.orders) / previous.orders) * 100 : 0
                },
                customers: {
                    current: current.customers?.length || 0,
                    previous: previous.customers?.length || 0,
                    growth: previous.customers?.length > 0 ?
                        ((current.customers?.length - previous.customers?.length) / previous.customers?.length) * 100 : 0
                },
                averageOrderValue: {
                    current: current.averageOrderValue,
                    previous: previous.averageOrderValue,
                    growth: previous.averageOrderValue > 0 ?
                        ((current.averageOrderValue - previous.averageOrderValue) / previous.averageOrderValue) * 100 : 0
                }
            },
            health: {
                outOfStock: businessHealth[0],
                pendingOrders: businessHealth[1],
                activeCustomers: businessHealth[2],
                productViews: businessHealth[3],
                healthScore: Math.max(0, 100 - (businessHealth[0] * 2 + businessHealth[1] * 0.5))
            },
            opportunities: growthOpportunities,
            risks: {
                outOfStock: riskAlerts[0],
                cancelledOrders: riskAlerts[1],
                lowRatedProducts: riskAlerts[2],
                riskLevel: riskAlerts[0] > 10 || riskAlerts[1] > 20 ? 'high' :
                    riskAlerts[0] > 5 || riskAlerts[1] > 10 ? 'medium' : 'low'
            }
        }

        return reply.code(200).send(
            new ApiResponse(200, insights, "Analytics insights fetched successfully")
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching analytics insights"))
    }
}

export {
    getStoreDashboard,
    getStoreSalesAnalytics,
    getTopSellingProducts,
    getCustomerAnalytics,
    getInventoryAnalytics,
    getAnalyticsInsights
}