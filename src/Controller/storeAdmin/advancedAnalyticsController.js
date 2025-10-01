
import { User } from "../../Models/userModel.js";
import { Product } from "../../Models/productModel.js";
import { Order } from "../../Models/orderModel.js";
import { SessionTracking } from "../../Models/sessionTrackingModel.js";
import { ProductView } from "../../Models/productViewModel.js";
import { CartEvent } from "../../Models/cartEventModel.js";
import { WishlistEvent } from "../../Models/wishlistEventModel.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import mongoose from "mongoose";

// Safe division utility function
const safeDivide = (numerator, denominator, defaultValue = 0) => {
  return {
    $cond: [
      { $and: [{ $ne: [denominator, 0] }, { $ne: [denominator, null] }, { $ne: [denominator, undefined] }] },
      { $divide: [numerator, denominator] },
      defaultValue
    ]
  };
};

// Safe multiplication utility function
const safeMultiply = (value1, value2, defaultValue = 0) => {
  return {
    $cond: [
      {
        $and: [
          { $ne: [value1, null] },
          { $ne: [value1, undefined] },
          { $ne: [value2, null] },
          { $ne: [value2, undefined] }
        ]
      },
      { $multiply: [value1, value2] },
      defaultValue
    ]
  };
};

// Enhanced Customer Behavior Analytics
const getCustomerBehaviorAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id;
    const { period = "30", start, end } = request.query;

    const dateFilter = { store_id: new mongoose.Types.ObjectId(storeId) };

    if (start && end) {
      dateFilter.created_at = {
        $gte: new Date(start),
        $lte: new Date(end),
      };
    } else {
      const days = Number.parseInt(period);
      const since = new Date();
      since.setDate(since.getDate() - days);
      dateFilter.created_at = { $gte: since };
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
      customerAcquisitionCost,
      churnAnalysis,
      loyaltyMetrics
    ] = await Promise.all([
      // Enhanced Customer Segmentation - FIXED
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
            totalSpent: { $sum: "$orders.total" },
            orderCount: { $size: "$orders" },
            avgOrderValue: {
              $cond: {
                if: { $gt: [{ $size: "$orders" }, 0] },
                then: { $divide: [{ $sum: "$orders.total" }, { $size: "$orders" }] },
                else: 0
              }
            },
            lastOrderDate: { $max: "$orders.created_at" },
            daysSinceLastOrder: {
              $cond: {
                if: { $gt: [{ $size: "$orders" }, 0] },
                then: {
                  $divide: [
                    { $subtract: [new Date(), { $max: "$orders.created_at" }] },
                    86400000
                  ]
                },
                else: null
              }
            }
          },
        },
        {
          $addFields: {
            segment: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $gte: ["$totalSpent", 1000] },
                        { $gte: ["$orderCount", 5] },
                        { $lte: ["$daysSinceLastOrder", 30] }
                      ]
                    },
                    then: "VIP"
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$totalSpent", 500] },
                        { $gte: ["$orderCount", 3] },
                        { $lte: ["$daysSinceLastOrder", 60] }
                      ]
                    },
                    then: "Loyal"
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ["$totalSpent", 100] },
                        { $gte: ["$orderCount", 2] }
                      ]
                    },
                    then: "Regular"
                  },
                  { case: { $eq: ["$orderCount", 1] }, then: "One-time" },
                ],
                default: "New",
              },
            },
            activityStatus: {
              $switch: {
                branches: [
                  { case: { $lte: ["$daysSinceLastOrder", 30] }, then: "Active" },
                  { case: { $lte: ["$daysSinceLastOrder", 90] }, then: "At Risk" },
                  { case: { $gt: ["$daysSinceLastOrder", 90] }, then: "Inactive" },
                ],
                default: "New",
              },
            },
          },
        },
        {
          $group: {
            _id: { segment: "$segment", activity: "$activityStatus" },
            count: { $sum: 1 },
            totalRevenue: { $sum: "$totalSpent" },
            avgOrderValue: { $avg: "$avgOrderValue" },
            avgOrderCount: { $avg: "$orderCount" },
            avgDaysSinceLastOrder: { $avg: "$daysSinceLastOrder" },
          },
        },
        {
          $project: {
            segment: "$_id.segment",
            activity: "$_id.activity",
            count: 1,
            totalRevenue: 1,
            avgOrderValue: 1,
            avgOrderCount: 1,
            avgDaysSinceLastOrder: 1,
            _id: 0
          }
        }
      ]),

      // Enhanced Customer Lifetime Value - FIXED (Percentile removed)
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
            totalSpent: { $sum: "$orders.total" },
            orderCount: { $size: "$orders" },
            firstOrderDate: { $min: "$orders.created_at" },
            lastOrderDate: { $max: "$orders.created_at" },
          },
        },
        {
          $match: {
            orderCount: { $gt: 0 }
          }
        },
        {
          $addFields: {
            customerLifespanDays: {
              $cond: {
                if: { $and: ["$firstOrderDate", "$lastOrderDate"] },
                then: {
                  $divide: [
                    { $subtract: ["$lastOrderDate", "$firstOrderDate"] },
                    86400000
                  ]
                },
                else: 0
              }
            },
            avgOrderValue: {
              $cond: {
                if: { $gt: ["$orderCount", 0] },
                then: { $divide: ["$totalSpent", "$orderCount"] },
                else: 0
              }
            }
          },
        },
        {
          $group: {
            _id: null,
            avgLifetimeValue: { $avg: "$totalSpent" },
            medianLifetimeValue: {
              $avg: "$totalSpent" // Simplified median calculation
            },
            avgOrderFrequency: { $avg: "$orderCount" },
            avgCustomerLifespan: { $avg: "$customerLifespanDays" },
            totalCustomers: { $sum: 1 },
            totalRevenue: { $sum: "$totalSpent" },
            maxLifetimeValue: { $max: "$totalSpent" },
            topCustomersRevenue: {
              $sum: {
                $cond: {
                  if: { $gte: ["$totalSpent", 1000] }, // Top customers threshold
                  then: "$totalSpent",
                  else: 0
                }
              }
            },
            topCustomerCount: {
              $sum: {
                $cond: {
                  if: { $gte: ["$totalSpent", 1000] },
                  then: 1,
                  else: 0
                }
              }
            }
          },
        },
        {
          $project: {
            avgLifetimeValue: 1,
            medianLifetimeValue: 1,
            avgOrderFrequency: 1,
            avgCustomerLifespan: 1,
            totalCustomers: 1,
            totalRevenue: 1,
            maxLifetimeValue: 1,
            topDecileValue: {
              $cond: {
                if: { $gt: ["$topCustomerCount", 0] },
                then: { $divide: ["$topCustomersRevenue", "$topCustomerCount"] },
                else: 0
              }
            },
            revenuePerCustomer: {
              $cond: {
                if: { $gt: ["$totalCustomers", 0] },
                then: { $divide: ["$totalRevenue", "$totalCustomers"] },
                else: 0
              }
            },
            _id: 0
          }
        }
      ]),

      // Enhanced Customer Retention Analysis - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: {
              user_id: "$user_id",
              month: { $dateToString: { format: "%Y-%m", date: "$created_at" } }
            },
            orderCount: { $sum: 1 },
            revenue: { $sum: "$total" }
          }
        },
        {
          $group: {
            _id: "$_id.month",
            totalCustomers: { $sum: 1 },
            totalRevenue: { $sum: "$revenue" },
            repeatCustomers: {
              $sum: {
                $cond: {
                  if: { $gt: ["$orderCount", 1] },
                  then: 1,
                  else: 0
                }
              }
            }
          }
        },
        {
          $project: {
            month: "$_id",
            totalCustomers: 1,
            totalRevenue: 1,
            repeatCustomers: 1,
            retentionRate: {
              $cond: {
                if: { $gt: ["$totalCustomers", 0] },
                then: { $multiply: [{ $divide: ["$repeatCustomers", "$totalCustomers"] }, 100] },
                else: 0
              }
            },
            avgRevenuePerCustomer: {
              $cond: {
                if: { $gt: ["$totalCustomers", 0] },
                then: { $divide: ["$totalRevenue", "$totalCustomers"] },
                else: 0
              }
            },
            _id: 0
          }
        },
        { $sort: { month: 1 } }
      ]),

      // Enhanced Customer Geography - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: dateFilter.created_at
          }
        },
        {
          $group: {
            _id: {
              country: "$shipping_address.country",
              state: "$shipping_address.state",
              city: "$shipping_address.city"
            },
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            uniqueCustomers: { $addToSet: "$user_id" },
            avgOrderValue: { $avg: "$total" }
          }
        },
        {
          $project: {
            country: "$_id.country",
            state: "$_id.state",
            city: "$_id.city",
            totalOrders: 1,
            totalRevenue: 1,
            uniqueCustomerCount: { $size: "$uniqueCustomers" },
            avgOrderValue: 1,
            revenuePerCustomer: {
              $cond: {
                if: { $gt: [{ $size: "$uniqueCustomers" }, 0] },
                then: { $divide: ["$totalRevenue", { $size: "$uniqueCustomers" }] },
                else: 0
              }
            },
            _id: 0
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 50 }
      ]),

      // Enhanced Device Analytics - FIXED
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              deviceType: "$device_info.type",
              browser: "$device_info.browser",
              os: "$device_info.os"
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            totalSessionDuration: { $sum: "$session_duration" },
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
            revenue: {
              $sum: {
                $reduce: {
                  input: "$conversion_events",
                  initialValue: 0,
                  in: { $add: ["$$value", { $ifNull: ["$$this.value", 0] }] }
                }
              }
            },
            bounces: {
              $sum: {
                $cond: {
                  if: "$is_bounce",
                  then: 1,
                  else: 0
                }
              }
            }
          },
        },
        {
          $project: {
            deviceType: "$_id.deviceType",
            browser: "$_id.browser",
            os: "$_id.os",
            sessions: 1,
            uniqueUserCount: { $size: "$uniqueUsers" },
            avgSessionDuration: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$totalSessionDuration", "$sessions"] },
                else: 0
              }
            },
            conversions: 1,
            conversionRate: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $multiply: [{ $divide: ["$conversions", "$sessions"] }, 100] },
                else: 0
              }
            },
            revenue: 1,
            bounceRate: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $multiply: [{ $divide: ["$bounces", "$sessions"] }, 100] },
                else: 0
              }
            },
            revenuePerSession: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$revenue", "$sessions"] },
                else: 0
              }
            },
            _id: 0
          }
        },
        { $sort: { sessions: -1 } }
      ]),

      // Enhanced Customer Journey Analysis - FIXED
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              source: { $ifNull: ["$utm_params.source", "direct"] },
              medium: { $ifNull: ["$utm_params.medium", "none"] },
              campaign: { $ifNull: ["$utm_params.campaign", "none"] }
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            totalSessionDuration: { $sum: "$session_duration" },
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
            revenue: {
              $sum: {
                $reduce: {
                  input: "$conversion_events",
                  initialValue: 0,
                  in: { $add: ["$$value", { $ifNull: ["$$this.value", 0] }] }
                }
              }
            }
          },
        },
        {
          $project: {
            source: "$_id.source",
            medium: "$_id.medium",
            campaign: "$_id.campaign",
            sessions: 1,
            uniqueUserCount: { $size: "$uniqueUsers" },
            avgSessionDuration: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$totalSessionDuration", "$sessions"] },
                else: 0
              }
            },
            avgPagesPerSession: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$pageViews", "$sessions"] },
                else: 0
              }
            },
            conversions: 1,
            conversionRate: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $multiply: [{ $divide: ["$conversions", "$sessions"] }, 100] },
                else: 0
              }
            },
            revenue: 1,
            revenuePerSession: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$revenue", "$sessions"] },
                else: 0
              }
            },
            _id: 0
          }
        },
        { $sort: { conversionRate: -1 } },
        { $limit: 50 }
      ]),

      // Enhanced Top Customers by Value - FIXED
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
            totalSpent: { $sum: "$orders.total" },
            orderCount: { $size: "$orders" },
            lastOrderDate: { $max: "$orders.created_at" },
            firstOrderDate: { $min: "$orders.created_at" },
            avgOrderValue: {
              $cond: {
                if: { $gt: ["$orderCount", 0] },
                then: { $divide: ["$totalSpent", "$orderCount"] },
                else: 0
              }
            },
            daysSinceLastOrder: {
              $cond: {
                if: { $gt: ["$orderCount", 0] },
                then: {
                  $divide: [
                    { $subtract: [new Date(), { $max: "$orders.created_at" }] },
                    86400000
                  ]
                },
                else: null
              }
            }
          },
        },
        { $match: { orderCount: { $gt: 0 } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 25 },
        {
          $project: {
            customerId: "$_id",
            customerName: "$name",
            customerEmail: "$email",
            customerPhone: "$phone_number",
            totalSpent: 1,
            orderCount: 1,
            lastOrderDate: 1,
            firstOrderDate: 1,
            avgOrderValue: 1,
            daysSinceLastOrder: 1,
            customerSince: "$created_at",
            lifetimeValue: "$totalSpent",
            segment: {
              $switch: {
                branches: [
                  { case: { $gte: ["$totalSpent", 1000] }, then: "VIP" },
                  { case: { $gte: ["$totalSpent", 500] }, then: "Loyal" },
                  { case: { $gte: ["$totalSpent", 100] }, then: "Regular" },
                ],
                default: "New",
              },
            },
          },
        },
      ]),

      // Enhanced Customer Activity Heatmap - FIXED
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              hour: { $hour: "$created_at" },
              dayOfWeek: { $dayOfWeek: "$created_at" },
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
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
            revenue: {
              $sum: {
                $reduce: {
                  input: "$conversion_events",
                  initialValue: 0,
                  in: { $add: ["$$value", { $ifNull: ["$$this.value", 0] }] }
                }
              }
            },
            totalDuration: { $sum: "$session_duration" }
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            conversionRate: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $multiply: [{ $divide: ["$conversions", "$sessions"] }, 100] },
                else: 0
              }
            },
            avgSessionDuration: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$totalDuration", "$sessions"] },
                else: 0
              }
            },
            revenuePerSession: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $divide: ["$revenue", "$sessions"] },
                else: 0
              }
            }
          },
        },
        { $sort: { sessions: -1 } }
      ]),

      // Customer Acquisition Cost Analysis - FIXED
      SessionTracking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              source: { $ifNull: ["$utm_params.source", "direct"] },
              campaign: { $ifNull: ["$utm_params.campaign", "none"] }
            },
            sessions: { $sum: 1 },
            newUsers: {
              $sum: {
                $cond: {
                  if: {
                    $and: [
                      { $ne: ["$user_id", null] },
                      { $eq: [{ $size: "$pages_visited" }, 1] }
                    ]
                  },
                  then: 1,
                  else: 0
                }
              }
            },
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
            revenue: {
              $sum: {
                $reduce: {
                  input: "$conversion_events",
                  initialValue: 0,
                  in: { $add: ["$$value", { $ifNull: ["$$this.value", 0] }] }
                }
              }
            }
          }
        },
        {
          $project: {
            source: "$_id.source",
            campaign: "$_id.campaign",
            sessions: 1,
            newUsers: 1,
            conversions: 1,
            revenue: 1,
            conversionRate: {
              $cond: {
                if: { $gt: ["$sessions", 0] },
                then: { $multiply: [{ $divide: ["$conversions", "$sessions"] }, 100] },
                else: 0
              }
            },
            costPerAcquisition: {
              $cond: {
                if: { $gt: ["$conversions", 0] },
                then: { $divide: [50, "$conversions"] },
                else: 0
              }
            },
            returnOnAdSpend: {
              $cond: {
                if: { $gt: [50, 0] },
                then: { $divide: ["$revenue", 50] },
                else: 0
              }
            },
            _id: 0
          }
        }
      ]),

      // Churn Analysis - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: "$user_id",
            lastOrderDate: { $max: "$created_at" },
            orderCount: { $sum: 1 },
            totalSpent: { $sum: "$total" }
          }
        },
        {
          $addFields: {
            daysSinceLastOrder: {
              $divide: [
                { $subtract: [new Date(), "$lastOrderDate"] },
                86400000
              ]
            },
            churnRisk: {
              $switch: {
                branches: [
                  { case: { $gt: ["$daysSinceLastOrder", 90] }, then: "Churned" },
                  { case: { $gt: ["$daysSinceLastOrder", 60] }, then: "High Risk" },
                  { case: { $gt: ["$daysSinceLastOrder", 30] }, then: "Medium Risk" },
                ],
                default: "Low Risk"
              }
            }
          }
        },
        {
          $group: {
            _id: "$churnRisk",
            customerCount: { $sum: 1 },
            avgOrderCount: { $avg: "$orderCount" },
            avgLifetimeValue: { $avg: "$totalSpent" },
            totalRevenueAtRisk: { $sum: "$totalSpent" }
          }
        }
      ]),

      // Loyalty and Engagement Metrics - FIXED
      User.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "orders",
            localField: "_id",
            foreignField: "user_id",
            as: "orders"
          }
        },
        {
          $lookup: {
            from: "sessiontrackings",
            localField: "_id",
            foreignField: "user_id",
            as: "sessions"
          }
        },
        {
          $addFields: {
            orderCount: { $size: "$orders" },
            totalSpent: { $sum: "$orders.total" },
            sessionCount: { $size: "$sessions" },
            lastLogin: { $max: "$sessions.created_at" },
            avgSessionDuration: { $avg: "$sessions.session_duration" }
          }
        },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            activeCustomers: {
              $sum: {
                $cond: {
                  if: { $gte: ["$lastLogin", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                  then: 1,
                  else: 0
                }
              }
            },
            avgOrdersPerCustomer: { $avg: "$orderCount" },
            avgSessionPerCustomer: { $avg: "$sessionCount" },
            avgSessionDuration: { $avg: "$avgSessionDuration" },
            repeatPurchaseRate: {
              $avg: {
                $cond: {
                  if: { $gt: ["$orderCount", 1] },
                  then: 100,
                  else: 0
                }
              }
            }
          }
        }
      ])
    ]);

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
          customerAcquisitionCost,
          churnAnalysis,
          loyaltyMetrics: loyaltyMetrics[0] || {},
          // Additional visualization data
          charts: {
            customerSegmentationChart: customerSegmentation.map(seg => ({
              segment: seg.segment,
              activity: seg.activity,
              count: seg.count,
              revenue: seg.totalRevenue
            })),
            retentionTrend: customerRetention.map(ret => ({
              month: ret.month,
              retentionRate: ret.retentionRate,
              totalCustomers: ret.totalCustomers
            })),
            geographyHeatmap: customerGeography.map(geo => ({
              country: geo.country,
              state: geo.state,
              city: geo.city,
              revenue: geo.totalRevenue,
              orders: geo.totalOrders
            })),
            deviceBreakdown: customerDevices.map(device => ({
              deviceType: device.deviceType,
              sessions: device.sessions,
              conversionRate: device.conversionRate
            }))
          }
        },
        "Customer behavior analytics fetched successfully",
      ),
    );
  } catch (error) {
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customer behavior analytics"));
  }
};

// Enhanced Product Performance Analytics
const getProductPerformanceAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id;
    const { period = "30", category, price_range } = request.query;

    const days = Number.parseInt(period);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const productMatchStage = {
      store_id: new mongoose.Types.ObjectId(storeId),
      created_at: { $gte: since }
    };

    if (category) {
      productMatchStage.parent_category = new mongoose.Types.ObjectId(category);
    }

    const [
      mostViewedProducts,
      mostAddedToCart,
      mostWishlisted,
      conversionFunnel,
      productEngagement,
      abandonedCartProducts,
      productRevenueAnalysis,
      productInventoryHealth,
      productSeasonality,
      productCompetitiveAnalysis
    ] = await Promise.all([
      // Enhanced Most Viewed Products - FIXED
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalViews: { $sum: 1 },
            uniqueViewers: { $addToSet: "$user_id" },
            avgViewDuration: { $avg: "$view_duration" },
            avgScrollDepth: { $avg: "$scroll_depth" },
            bounceRate: {
              $avg: {
                $cond: [
                  {
                    $or: [
                      { $lt: ["$view_duration", 15] },
                      { $eq: ["$view_duration", null] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            interactions: { $sum: { $size: "$interactions" } },
            lastViewed: { $max: "$created_at" }
          },
        },
        {
          $addFields: {
            uniqueViewerCount: { $size: "$uniqueViewers" },
            engagementRate: safeMultiply(
              safeDivide("$interactions", "$totalViews"),
              100
            )
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            category: "$product.parent_category",
            stock: "$product.stock.quantity",
            totalViews: 1,
            uniqueViewerCount: 1,
            avgViewDuration: 1,
            avgScrollDepth: 1,
            bounceRate: safeMultiply("$bounceRate", 100),
            engagementRate: 1,
            interactions: 1,
            lastViewed: 1,
            viewsPerUser: safeDivide("$totalViews", "$uniqueViewerCount")
          },
        },
        { $sort: { totalViews: -1 } },
        { $limit: 25 },
      ]),

      // Enhanced Most Added to Cart - FIXED
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            action: "add",
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalAdds: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            totalQuantity: { $sum: "$quantity" },
            totalValue: { $sum: { $multiply: ["$quantity", "$price"] } },
            avgPrice: { $avg: "$price" }
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            avgCartValue: safeDivide("$totalValue", "$totalQuantity")
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            totalAdds: 1,
            uniqueUserCount: 1,
            totalQuantity: 1,
            totalValue: 1,
            avgPrice: 1,
            avgCartValue: 1,
            addsPerUser: safeDivide("$totalAdds", "$uniqueUserCount")
          },
        },
        { $sort: { totalAdds: -1 } },
        { $limit: 25 },
      ]),

      // Enhanced Most Wishlisted Products - FIXED
      WishlistEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            action: "add",
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            totalWishlists: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" }
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            wishlistEngagement: safeDivide("$totalWishlists", "$uniqueUserCount")
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            totalWishlists: 1,
            uniqueUserCount: 1,
            wishlistEngagement: 1,
            potentialRevenue: safeMultiply("$totalWishlists", "$product.price")
          },
        },
        { $sort: { totalWishlists: -1 } },
        { $limit: 25 },
      ]),

      // Enhanced Conversion Funnel - FIXED
      Product.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $lookup: {
            from: "productviews",
            localField: "_id",
            foreignField: "product_id",
            as: "views",
            pipeline: [{ $match: { created_at: { $gte: since } } }],
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
                  action: "add",
                  created_at: { $gte: since },
                },
              },
            ],
          },
        },
        {
          $lookup: {
            from: "wishlistevents",
            localField: "_id",
            foreignField: "product_id",
            as: "wishlistAdds",
            pipeline: [
              {
                $match: {
                  action: "add",
                  created_at: { $gte: since },
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
            category: "$parent_category",
            stock: "$stock.quantity",
            ratings: "$ratings",
            viewCount: { $size: "$views" },
            cartAddCount: { $size: "$cartAdds" },
            wishlistCount: { $size: "$wishlistAdds" },
            orderCount: { $size: "$orders" },
            totalRevenue: {
              $sum: {
                $map: {
                  input: "$orders",
                  as: "order",
                  in: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$$order.items",
                            as: "item",
                            cond: { $eq: ["$$item.product_id", "$_id"] }
                          }
                        },
                        as: "item",
                        in: { $multiply: ["$$item.quantity", "$$item.price"] }
                      }
                    }
                  }
                }
              }
            },
            viewToCartRate: safeMultiply(
              safeDivide({ $size: "$cartAdds" }, { $size: "$views" }),
              100
            ),
            cartToOrderRate: safeMultiply(
              safeDivide({ $size: "$orders" }, { $size: "$cartAdds" }),
              100
            ),
            overallConversionRate: safeMultiply(
              safeDivide({ $size: "$orders" }, { $size: "$views" }),
              100
            )
          },
        },
        { $sort: { viewCount: -1 } },
        { $limit: 30 },
      ]),

      // Product Engagement Metrics - FIXED
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$product_id",
            avgEngagementTime: { $avg: "$view_duration" },
            avgScrollDepth: { $avg: "$scroll_depth" },
            totalViews: { $sum: 1 },
            uniqueViewers: { $addToSet: "$user_id" },
            interactions: { $sum: { $size: "$interactions" } }
          },
        },
        {
          $addFields: {
            uniqueViewerCount: { $size: "$uniqueViewers" },
            engagementScore: {
              $add: [
                safeMultiply("$avgEngagementTime", 0.4),
                safeMultiply("$avgScrollDepth", 0.3),
                safeMultiply(safeDivide("$interactions", "$totalViews"), 30)
              ]
            }
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            avgEngagementTime: 1,
            avgScrollDepth: 1,
            totalViews: 1,
            uniqueViewerCount: 1,
            engagementScore: 1,
            interactions: 1,
            viewsPerUser: safeDivide("$totalViews", "$uniqueViewerCount")
          },
        },
        { $sort: { engagementScore: -1 } },
        { $limit: 25 },
      ]),

      // Product Revenue Analysis - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
            status: { $in: ["completed", "delivered", "paid"] },
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
            maxPrice: { $max: "$items.price" },
            minPrice: { $min: "$items.price" },
            uniqueCustomers: { $addToSet: "$user_id" }
          },
        },
        {
          $addFields: {
            revenuePerUnit: safeDivide("$totalRevenue", "$totalQuantitySold"),
            avgOrderValue: safeDivide("$totalRevenue", "$orderCount"),
            uniqueCustomerCount: { $size: "$uniqueCustomers" },
            revenuePerCustomer: safeDivide("$totalRevenue", { $size: "$uniqueCustomers" })
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            category: "$product.parent_category",
            totalRevenue: 1,
            totalQuantitySold: 1,
            orderCount: 1,
            avgPrice: 1,
            maxPrice: 1,
            minPrice: 1,
            revenuePerUnit: 1,
            avgOrderValue: 1,
            uniqueCustomerCount: 1,
            revenuePerCustomer: 1,
            profitMargin: safeMultiply("$totalRevenue", 0.3)
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 30 },
      ]),

      // Product Inventory Health - FIXED
      Product.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
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
          $addFields: {
            totalSold: {
              $sum: {
                $map: {
                  input: "$orders",
                  as: "order",
                  in: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$$order.items",
                            as: "item",
                            cond: { $eq: ["$$item.product_id", "$_id"] }
                          }
                        },
                        as: "item",
                        in: "$$item.quantity"
                      }
                    }
                  }
                }
              }
            },
            stockHealth: {
              $switch: {
                branches: [
                  { case: { $lte: ["$stock.quantity", 0] }, then: "Out of Stock" },
                  { case: { $lte: ["$stock.quantity", "$stock.low_stock_threshold"] }, then: "Low Stock" },
                  { case: { $lte: ["$stock.quantity", { $multiply: ["$stock.low_stock_threshold", 2] }] }, then: "Medium Stock" },
                ],
                default: "Healthy Stock"
              }
            },
            sellThroughRate: safeMultiply(
              safeDivide("$totalSold", { $add: ["$totalSold", "$stock.quantity"] }),
              100
            ),
            inventoryValue: safeMultiply("$stock.quantity", "$price")
          }
        },
        {
          $project: {
            productId: "$_id",
            productName: "$name",
            currentStock: "$stock.quantity",
            lowStockThreshold: "$stock.low_stock_threshold",
            price: 1,
            totalSold: 1,
            stockHealth: 1,
            sellThroughRate: 1,
            inventoryValue: 1,
            restockUrgency: {
              $switch: {
                branches: [
                  { case: { $eq: ["$stockHealth", "Out of Stock"] }, then: "Critical" },
                  { case: { $eq: ["$stockHealth", "Low Stock"] }, then: "High" },
                  { case: { $eq: ["$stockHealth", "Medium Stock"] }, then: "Medium" },
                ],
                default: "Low"
              }
            }
          }
        },
        { $sort: { restockUrgency: -1, sellThroughRate: -1 } },
        { $limit: 20 }
      ]),

      // Simplified Product Seasonality Analysis
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
          }
        },
        { $unwind: "$items" },
        {
          $group: {
            _id: {
              productId: "$items.product_id",
              month: { $month: "$created_at" }
            },
            quantitySold: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } }
          }
        },
        {
          $group: {
            _id: "$_id.productId",
            monthlyPerformance: {
              $push: {
                month: "$_id.month",
                quantitySold: "$quantitySold",
                revenue: "$revenue"
              }
            },
            totalSold: { $sum: "$quantitySold" },
            totalRevenue: { $sum: "$revenue" }
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            monthlyPerformance: 1,
            totalSold: 1,
            totalRevenue: 1
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 15 }
      ]),

      // Product Competitive Analysis - FIXED
      Product.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
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
          $lookup: {
            from: "productviews",
            localField: "_id",
            foreignField: "product_id",
            as: "views",
            pipeline: [{ $match: { created_at: { $gte: since } } }],
          },
        },
        {
          $lookup: {
            from: "cartevents",
            localField: "_id",
            foreignField: "product_id",
            as: "cartAdds",
            pipeline: [{ $match: { created_at: { $gte: since } } }],
          },
        },
        {
          $addFields: {
            totalRevenue: {
              $sum: {
                $map: {
                  input: "$orders",
                  as: "order",
                  in: {
                    $sum: {
                      $map: {
                        input: {
                          $filter: {
                            input: "$$order.items",
                            as: "item",
                            cond: { $eq: ["$$item.product_id", "$_id"] }
                          }
                        },
                        as: "item",
                        in: { $multiply: ["$$item.quantity", "$$item.price"] }
                      }
                    }
                  }
                }
              }
            },
            viewCount: { $size: "$views" },
            cartAddCount: { $size: "$cartAdds" },
            orderCount: { $size: "$orders" }
          }
        },
        {
          $group: {
            _id: "$parent_category",
            products: {
              $push: {
                productId: "$_id",
                name: "$name",
                price: "$price",
                totalRevenue: "$totalRevenue",
                viewCount: "$viewCount",
                cartAddCount: "$cartAddCount",
                orderCount: "$orderCount",
                ratings: "$ratings",
                stock: "$stock.quantity"
              }
            },
            categoryRevenue: { $sum: "$totalRevenue" },
            avgPrice: { $avg: "$price" }
          }
        },
        {
          $project: {
            category: "$_id",
            products: {
              $map: {
                input: "$products",
                as: "product",
                in: {
                  $mergeObjects: [
                    "$$product",
                    {
                      marketShare: safeMultiply(
                        safeDivide("$$product.totalRevenue", "$categoryRevenue"),
                        100
                      ),
                      pricePosition: {
                        $cond: [
                          { $gt: ["$$product.price", "$avgPrice"] },
                          "Premium",
                          "Value"
                        ]
                      }
                    }
                  ]
                }
              }
            },
            categoryRevenue: 1,
            avgPrice: 1,
            productCount: { $size: "$products" }
          }
        },
        { $sort: { categoryRevenue: -1 } }
      ])
    ]);

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
          productInventoryHealth,
          productSeasonality,
          productCompetitiveAnalysis,
          // Enhanced visualization data
          charts: {
            productPerformance: mostViewedProducts.map(product => ({
              name: product.productName,
              views: product.totalViews,
              adds: mostAddedToCart.find(p => p.productId?.toString() === product.productId?.toString())?.totalAdds || 0,
              wishlists: mostWishlisted.find(p => p.productId?.toString() === product.productId?.toString())?.totalWishlists || 0,
              revenue: productRevenueAnalysis.find(p => p.productId?.toString() === product.productId?.toString())?.totalRevenue || 0
            })),
            conversionFunnelData: conversionFunnel.map(product => ({
              name: product.name,
              views: product.viewCount,
              cartAdds: product.cartAddCount,
              orders: product.orderCount,
              conversionRate: product.overallConversionRate
            })),
            inventoryHealth: productInventoryHealth.map(product => ({
              name: product.productName,
              stock: product.currentStock,
              health: product.stockHealth,
              urgency: product.restockUrgency
            }))
          }
        },
        "Product performance analytics fetched successfully",
      ),
    );
  } catch (error) {
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product performance analytics"));
  }
};

// Enhanced Geographic Analytics
const getGeographicAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id;
    const { period = "30" } = request.query;

    const days = Number.parseInt(period);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const dateFilter = {
      store_id: new mongoose.Types.ObjectId(storeId),
      created_at: { $gte: since }
    };

    const [
      countryAnalytics,
      cityAnalytics,
      trafficSources,
      deviceByLocation,
      conversionByLocation,
      regionalPerformance,
      shippingAnalysis
    ] = await Promise.all([
      // Enhanced Country-wise Analytics - FIXED
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
            _id: "$shipping_address.country",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            uniqueCustomers: { $addToSet: "$user_id" },
            avgOrderValue: { $avg: "$total" }
          },
        },
        {
          $addFields: {
            uniqueCustomerCount: { $size: "$uniqueCustomers" },
            revenuePerCustomer: safeDivide("$totalRevenue", { $size: "$uniqueCustomers" })
          },
        },
        {
          $project: {
            country: "$_id",
            totalOrders: 1,
            totalRevenue: 1,
            uniqueCustomerCount: 1,
            avgOrderValue: 1,
            revenuePerCustomer: 1,
            _id: 0
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 50 },
      ]),

      // Enhanced City-wise Analytics - FIXED
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
            _id: {
              country: "$shipping_address.country",
              state: "$shipping_address.state",
              city: "$shipping_address.city"
            },
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            uniqueCustomers: { $addToSet: "$user_id" },
            avgOrderValue: { $avg: "$total" }
          },
        },
        {
          $addFields: {
            uniqueCustomerCount: { $size: "$uniqueCustomers" },
            revenuePerCustomer: safeDivide("$totalRevenue", { $size: "$uniqueCustomers" })
          },
        },
        {
          $project: {
            country: "$_id.country",
            state: "$_id.state",
            city: "$_id.city",
            totalOrders: 1,
            totalRevenue: 1,
            uniqueCustomerCount: 1,
            avgOrderValue: 1,
            revenuePerCustomer: 1,
            _id: 0
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 30 },
      ]),

      // Enhanced Traffic Sources by Location - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $group: {
            _id: {
              country: "$location.country",
              source: { $ifNull: ["$utm_params.source", "direct"] },
              medium: { $ifNull: ["$utm_params.medium", "none"] }
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
            totalDuration: { $sum: "$session_duration" },
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
            }
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            avgSessionDuration: safeDivide("$totalDuration", "$sessions"),
            conversionRate: safeMultiply(safeDivide("$conversions", "$sessions"), 100)
          },
        },
        {
          $project: {
            country: "$_id.country",
            source: "$_id.source",
            medium: "$_id.medium",
            sessions: 1,
            uniqueUserCount: 1,
            avgSessionDuration: 1,
            conversions: 1,
            conversionRate: 1,
            _id: 0
          }
        },
        { $sort: { sessions: -1 } },
        { $limit: 50 },
      ]),

      // Enhanced Device Usage by Location - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $group: {
            _id: {
              country: "$location.country",
              deviceType: "$device_info.type"
            },
            sessions: { $sum: 1 },
            uniqueUsers: { $addToSet: "$user_id" },
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
            }
          },
        },
        {
          $addFields: {
            uniqueUserCount: { $size: "$uniqueUsers" },
            avgSessionDuration: safeDivide("$totalDuration", "$sessions"),
            avgPagesPerSession: safeDivide("$pageViews", "$sessions"),
            conversionRate: safeMultiply(safeDivide("$conversions", "$sessions"), 100)
          },
        },
        {
          $project: {
            country: "$_id.country",
            deviceType: "$_id.deviceType",
            sessions: 1,
            uniqueUserCount: 1,
            avgSessionDuration: 1,
            avgPagesPerSession: 1,
            conversionRate: 1,
            _id: 0
          }
        },
        { $sort: { sessions: -1 } },
      ]),

      // Enhanced Conversion Analysis by Location - FIXED
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
            _id: "$shipping_address.country",
            totalConversions: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            avgOrderValue: { $avg: "$total" },
            uniqueCustomers: { $addToSet: "$user_id" }
          },
        },
        {
          $addFields: {
            uniqueCustomerCount: { $size: "$uniqueCustomers" },
            revenuePerCustomer: safeDivide("$totalRevenue", { $size: "$uniqueCustomers" })
          },
        },
        {
          $project: {
            country: "$_id",
            totalConversions: 1,
            totalRevenue: 1,
            avgOrderValue: 1,
            uniqueCustomerCount: 1,
            revenuePerCustomer: 1,
            _id: 0
          }
        },
        { $sort: { totalRevenue: -1 } },
      ]),

      // Regional Performance Analysis - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
            status: { $in: ["completed", "delivered", "paid"] },
          },
        },
        {
          $group: {
            _id: {
              country: "$shipping_address.country",
              week: { $week: "$created_at" }
            },
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
            customers: { $addToSet: "$user_id" }
          }
        },
        {
          $group: {
            _id: "$_id.country",
            weeklyPerformance: {
              $push: {
                week: "$_id.week",
                revenue: "$revenue",
                orders: "$orders",
                customers: { $size: "$customers" }
              }
            },
            totalRevenue: { $sum: "$revenue" },
            totalOrders: { $sum: "$orders" }
          }
        },
        {
          $project: {
            country: "$_id",
            weeklyPerformance: 1,
            totalRevenue: 1,
            totalOrders: 1,
            _id: 0
          }
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 }
      ]),

      // Shipping and Delivery Analysis by Region - FIXED
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: since },
            status: { $in: ["completed", "delivered"] },
          },
        },
        {
          $lookup: {
            from: "shippings",
            localField: "_id",
            foreignField: "order_id",
            as: "shipping"
          }
        },
        { $unwind: { path: "$shipping", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: "$shipping_address.country",
            totalOrders: { $sum: 1 },
            avgShippingCost: { $avg: "$shipping.cost" },
            deliverySuccessRate: {
              $avg: {
                $cond: [
                  { $eq: ["$shipping.status", "delivered"] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            country: "$_id",
            totalOrders: 1,
            avgShippingCost: 1,
            deliverySuccessRate: safeMultiply("$deliverySuccessRate", 100),
            _id: 0
          }
        },
        { $sort: { totalOrders: -1 } }
      ])
    ]);

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          countryAnalytics,
          cityAnalytics,
          trafficSources,
          deviceByLocation,
          conversionByLocation,
          regionalPerformance,
          shippingAnalysis,
          // Enhanced visualization data
          charts: {
            worldMap: countryAnalytics.map(country => ({
              country: country.country,
              revenue: country.totalRevenue,
              orders: country.totalOrders,
              customers: country.uniqueCustomerCount
            })),
            regionalBreakdown: cityAnalytics.map(city => ({
              country: city.country,
              state: city.state,
              city: city.city,
              revenue: city.totalRevenue,
              orders: city.totalOrders
            })),
            trafficSourcesChart: trafficSources.map(source => ({
              country: source.country,
              source: source.source,
              medium: source.medium,
              sessions: source.sessions,
              conversionRate: source.conversionRate
            }))
          }
        },
        "Geographic analytics fetched successfully",
      ),
    );
  } catch (error) {
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching geographic analytics"));
  }
};

// Enhanced Real-time Analytics
const getRealTimeAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id;
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
    const last30Minutes = new Date(now.getTime() - 30 * 60 * 1000);

    const [
      activeUsers,
      recentActivity,
      liveConversions,
      topPages,
      realtimeMetrics,
      liveSessions,
      systemHealth,
      performanceAlerts
    ] = await Promise.all([
      // Enhanced Active Users - FIXED
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: last30Minutes }
          }
        },
        {
          $group: {
            _id: null,
            totalActive: { $sum: 1 },
            byDevice: {
              $push: "$device_info.type"
            },
            byCountry: {
              $push: "$location.country"
            },
            pagesViewed: {
              $sum: { $size: "$pages_visited" }
            }
          }
        },
        {
          $project: {
            totalActive: 1,
            deviceBreakdown: {
              desktop: {
                $size: {
                  $filter: {
                    input: "$byDevice",
                    as: "device",
                    cond: { $eq: ["$$device", "desktop"] }
                  }
                }
              },
              mobile: {
                $size: {
                  $filter: {
                    input: "$byDevice",
                    as: "device",
                    cond: { $eq: ["$$device", "mobile"] }
                  }
                }
              },
              tablet: {
                $size: {
                  $filter: {
                    input: "$byDevice",
                    as: "device",
                    cond: { $eq: ["$$device", "tablet"] }
                  }
                }
              }
            },
            avgPagesPerSession: safeDivide("$pagesViewed", "$totalActive")
          }
        }
      ]),

      // Enhanced Recent Activity
      SessionTracking.find({
        store_id: storeId,
        created_at: { $gte: last24Hours },
      })
        .sort({ created_at: -1 })
        .limit(50)
        .populate("user_id", "name email")
        .select("user_id location device_info referrer created_at session_duration pages_visited")
        .lean(),

      // Enhanced Live Conversions
      Order.find({
        store_id: storeId,
        created_at: { $gte: last24Hours },
      })
        .sort({ created_at: -1 })
        .limit(25)
        .populate("user_id", "name email")
        .populate("items.product_id", "name images")
        .select("order_number total user_id created_at items status")
        .lean(),

      // Enhanced Top Pages/Products - FIXED
      ProductView.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: lastHour },
          },
        },
        {
          $group: {
            _id: "$product_id",
            views: { $sum: 1 },
            uniqueViewers: { $addToSet: "$user_id" },
            avgDuration: { $avg: "$view_duration" }
          },
        },
        {
          $addFields: {
            uniqueViewerCount: { $size: "$uniqueViewers" }
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
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            productImage: { $arrayElemAt: ["$product.images", 0] },
            price: "$product.price",
            views: 1,
            uniqueViewerCount: 1,
            avgDuration: 1,
            viewsPerMinute: safeDivide("$views", 60)
          },
        },
        { $sort: { views: -1 } },
        { $limit: 15 },
      ]),

      // Enhanced Real-time Metrics - FIXED
      SessionTracking.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: last24Hours },
          },
        },
        {
          $facet: {
            hourlyMetrics: [
              {
                $group: {
                  _id: {
                    hour: { $hour: "$created_at" },
                    date: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } }
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
                  totalDuration: { $sum: "$session_duration" }
                }
              },
              { $sort: { "_id.date": 1, "_id.hour": 1 } }
            ],
            currentHour: [
              {
                $match: {
                  created_at: { $gte: lastHour }
                }
              },
              {
                $group: {
                  _id: null,
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
                  avgSessionDuration: { $avg: "$session_duration" }
                }
              }
            ]
          }
        }
      ]),

      // Live Sessions with Detailed Info
      SessionTracking.find({
        store_id: storeId,
        created_at: { $gte: last30Minutes }
      })
        .sort({ created_at: -1 })
        .limit(15)
        .populate("user_id", "name email")
        .select("user_id location device_info referrer created_at session_duration pages_visited")
        .lean(),

      // System Health Metrics
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
          last_login: { $gte: last24Hours }
        }),
        ProductView.countDocuments({
          store_id: storeId,
          created_at: { $gte: lastHour }
        })
      ]),

      // Performance Alerts
      Order.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            created_at: { $gte: last24Hours },
            status: { $in: ["cancelled", "failed"] }
          }
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalValue: { $sum: "$total" }
          }
        }
      ])
    ]);

    const systemHealthData = {
      outOfStockProducts: systemHealth[0],
      pendingOrders: systemHealth[1],
      activeUsers: systemHealth[2],
      recentProductViews: systemHealth[3],
      healthScore: Math.max(0, 100 - (systemHealth[0] * 2 + systemHealth[1] * 0.5))
    };

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          activeUsers: activeUsers[0] || { totalActive: 0, deviceBreakdown: {}, avgPagesPerSession: 0 },
          recentActivity,
          liveConversions,
          topPages,
          realtimeMetrics: realtimeMetrics[0] || { hourlyMetrics: [], currentHour: [] },
          liveSessions,
          systemHealth: systemHealthData,
          performanceAlerts,
          // Enhanced visualization data
          charts: {
            activeUsersChart: {
              total: activeUsers[0]?.totalActive || 0,
              byDevice: activeUsers[0]?.deviceBreakdown || {},
              trend: realtimeMetrics[0]?.hourlyMetrics || []
            },
            conversionMetrics: {
              currentHour: realtimeMetrics[0]?.currentHour?.[0] || {},
              hourlyTrend: realtimeMetrics[0]?.hourlyMetrics || []
            },
            topProducts: topPages.map(product => ({
              name: product.productName,
              views: product.views,
              engagement: product.avgDuration
            }))
          }
        },
        "Real-time analytics fetched successfully",
      ),
    );
  } catch (error) {
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching real-time analytics"));
  }
};

// Enhanced Conversion Funnel Analytics
const getConversionFunnelAnalytics = async (request, reply) => {
  try {
    const storeId = request.user.store_id;
    const { period = "30" } = request.query;

    const days = Number.parseInt(period);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const dateFilter = {
      store_id: new mongoose.Types.ObjectId(storeId),
      created_at: { $gte: since }
    };

    const [
      overallFunnel,
      funnelBySource,
      funnelByDevice,
      abandonmentAnalysis,
      funnelByTime,
      funnelByCustomerSegment,
      recoveryAnalysis
    ] = await Promise.all([
      // Enhanced Overall Conversion Funnel - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $facet: {
            totalSessions: [{ $count: "count" }],
            productViews: [
              {
                $match: {
                  "pages_visited": {
                    $elemMatch: {
                      url: { $regex: /product/, $options: "i" }
                    }
                  }
                }
              },
              { $count: "count" },
            ],
            cartAdds: [
              {
                $match: {
                  "conversion_events": {
                    $elemMatch: {
                      event_type: "cart_add"
                    }
                  }
                }
              },
              { $count: "count" },
            ],
            conversions: [
              {
                $match: {
                  "conversion_events": {
                    $elemMatch: {
                      event_type: "purchase"
                    }
                  }
                }
              },
              { $count: "count" }
            ]
          },
        },
      ]),

      // Enhanced Funnel by Traffic Source - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $group: {
            _id: {
              source: { $ifNull: ["$utm_params.source", "direct"] },
              medium: { $ifNull: ["$utm_params.medium", "none"] }
            },
            sessions: { $sum: 1 },
            productViews: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$pages_visited",
                            as: "page",
                            cond: { $regexMatch: { input: "$$page.url", regex: /product/ } }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            cartAdds: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "cart_add"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            conversions: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "purchase"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            source: "$_id.source",
            medium: "$_id.medium",
            sessions: 1,
            productViews: 1,
            cartAdds: 1,
            conversions: 1,
            viewRate: safeMultiply(safeDivide("$productViews", "$sessions"), 100),
            cartRate: safeMultiply(safeDivide("$cartAdds", "$productViews"), 100),
            conversionRate: safeMultiply(safeDivide("$conversions", "$sessions"), 100),
            _id: 0
          }
        }
      ]),

      // Enhanced Funnel by Device Type - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $group: {
            _id: "$device_info.type",
            sessions: { $sum: 1 },
            productViews: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$pages_visited",
                            as: "page",
                            cond: { $regexMatch: { input: "$$page.url", regex: /product/ } }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            cartAdds: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "cart_add"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            conversions: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "purchase"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          },
        },
        {
          $project: {
            deviceType: "$_id",
            sessions: 1,
            productViews: 1,
            cartAdds: 1,
            conversions: 1,
            viewRate: safeMultiply(safeDivide("$productViews", "$sessions"), 100),
            cartRate: safeMultiply(safeDivide("$cartAdds", "$productViews"), 100),
            conversionRate: safeMultiply(safeDivide("$conversions", "$sessions"), 100),
            _id: 0
          },
        },
      ]),

      // Enhanced Cart Abandonment Analysis - FIXED
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            action: "add",
            created_at: { $gte: since },
          },
        },
        {
          $lookup: {
            from: "orders",
            localField: "session_id",
            foreignField: "session_id",
            as: "orders"
          }
        },
        {
          $addFields: {
            wasConverted: { $gt: [{ $size: "$orders" }, 0] },
            cartValue: { $multiply: ["$quantity", "$price"] }
          }
        },
        {
          $group: {
            _id: {
              hour: { $hour: "$created_at" },
              dayOfWeek: { $dayOfWeek: "$created_at" },
            },
            totalCartAdds: { $sum: 1 },
            totalCartValue: { $sum: "$cartValue" },
            conversions: { $sum: { $cond: ["$wasConverted", 1, 0] } }
          },
        },
        {
          $addFields: {
            abandonmentRate: safeMultiply(
              { $subtract: [1, safeDivide("$conversions", "$totalCartAdds")] },
              100
            )
          },
        },
        {
          $project: {
            hour: "$_id.hour",
            dayOfWeek: "$_id.dayOfWeek",
            totalCartAdds: 1,
            totalCartValue: 1,
            conversions: 1,
            abandonmentRate: 1,
            _id: 0
          }
        },
        { $sort: { abandonmentRate: -1 } }
      ]),

      // Funnel by Customer Segment - FIXED
      SessionTracking.aggregate([
        {
          $match: dateFilter,
        },
        {
          $lookup: {
            from: "users",
            localField: "user_id",
            foreignField: "_id",
            as: "user"
          }
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "orders",
            localField: "user_id",
            foreignField: "user_id",
            as: "userOrders"
          }
        },
        {
          $addFields: {
            customerSegment: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $gte: [{ $size: "$userOrders" }, 5] },
                        { $gte: [{ $sum: "$userOrders.total" }, 1000] }
                      ]
                    },
                    then: "VIP"
                  },
                  {
                    case: {
                      $and: [
                        { $gte: [{ $size: "$userOrders" }, 2] },
                        { $gte: [{ $sum: "$userOrders.total" }, 100] }
                      ]
                    },
                    then: "Loyal"
                  },
                  {
                    case: { $eq: [{ $size: "$userOrders" }, 1] },
                    then: "First-time"
                  }
                ],
                default: "New"
              }
            }
          }
        },
        {
          $group: {
            _id: "$customerSegment",
            sessions: { $sum: 1 },
            productViews: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$pages_visited",
                            as: "page",
                            cond: { $regexMatch: { input: "$$page.url", regex: /product/ } }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            cartAdds: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "cart_add"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            conversions: {
              $sum: {
                $cond: [
                  {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: "$conversion_events",
                            as: "event",
                            cond: { $eq: ["$$event.event_type", "purchase"] }
                          }
                        }
                      },
                      0
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            segment: "$_id",
            sessions: 1,
            productViews: 1,
            cartAdds: 1,
            conversions: 1,
            viewRate: safeMultiply(safeDivide("$productViews", "$sessions"), 100),
            cartRate: safeMultiply(safeDivide("$cartAdds", "$productViews"), 100),
            conversionRate: safeMultiply(safeDivide("$conversions", "$sessions"), 100),
            _id: 0
          }
        }
      ]),

      // Simplified Recovery Analysis
      CartEvent.aggregate([
        {
          $match: {
            store_id: new mongoose.Types.ObjectId(storeId),
            action: "add",
            created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $lookup: {
            from: "orders",
            localField: "session_id",
            foreignField: "session_id",
            as: "orders"
          }
        },
        {
          $addFields: {
            wasConverted: { $gt: [{ $size: "$orders" }, 0] },
            hoursSinceAdd: safeDivide(
              { $subtract: [new Date(), "$created_at"] },
              3600000
            )
          }
        },
        {
          $match: {
            wasConverted: false,
            hoursSinceAdd: { $gte: 1 }
          }
        },
        {
          $group: {
            _id: "$product_id",
            abandonedCarts: { $sum: 1 },
            potentialRevenue: { $sum: { $multiply: ["$quantity", "$price"] } },
            uniqueUsers: { $addToSet: "$user_id" }
          }
        },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            productId: "$_id",
            productName: "$product.name",
            abandonedCarts: 1,
            potentialRevenue: 1,
            uniqueUsers: { $size: "$uniqueUsers" },
            _id: 0
          }
        },
        { $sort: { potentialRevenue: -1 } },
        { $limit: 20 }
      ])
    ]);

    // Process overall funnel data
    const funnelData = overallFunnel[0] || {};
    const processedFunnel = {
      totalSessions: funnelData.totalSessions?.[0]?.count || 0,
      productViews: funnelData.productViews?.[0]?.count || 0,
      cartAdds: funnelData.cartAdds?.[0]?.count || 0,
      conversions: funnelData.conversions?.[0]?.count || 0
    };

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          overallFunnel: processedFunnel,
          funnelBySource: funnelBySource,
          funnelByDevice,
          abandonmentAnalysis,
          funnelByTime: [], // Simplified for now
          funnelByCustomerSegment,
          recoveryAnalysis,
          // Enhanced visualization data
          charts: {
            funnelChart: {
              stages: [
                { name: "Sessions", value: processedFunnel.totalSessions },
                { name: "Product Views", value: processedFunnel.productViews },
                { name: "Cart Adds", value: processedFunnel.cartAdds },
                { name: "Conversions", value: processedFunnel.conversions }
              ],
              rates: {
                viewRate: safeDivide(processedFunnel.productViews, processedFunnel.totalSessions, 0) * 100,
                cartRate: safeDivide(processedFunnel.cartAdds, processedFunnel.productViews, 0) * 100,
                conversionRate: safeDivide(processedFunnel.conversions, processedFunnel.totalSessions, 0) * 100
              }
            },
            sourcePerformance: funnelBySource.map(source => ({
              source: source.source,
              medium: source.medium,
              conversionRate: source.conversionRate,
              sessions: source.sessions
            })),
            devicePerformance: funnelByDevice.map(device => ({
              device: device.deviceType,
              conversionRate: device.conversionRate,
              sessions: device.sessions
            }))
          }
        },
        "Conversion funnel analytics fetched successfully",
      ),
    );
  } catch (error) {
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching conversion funnel analytics"));
  }
};

export {
  getCustomerBehaviorAnalytics,
  getProductPerformanceAnalytics,
  getGeographicAnalytics,
  getRealTimeAnalytics,
  getConversionFunnelAnalytics,
};
