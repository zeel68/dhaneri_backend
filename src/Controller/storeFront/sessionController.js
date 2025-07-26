import { SessionTracking } from "../../Models/sessionTrackingModel.js"
import { ProductView } from "../../Models/productViewModel.js"
import { CartEvent } from "../../Models/cartEventModel.js"
import { WishlistEvent } from "../../Models/wishlistEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import {asyncHandler as AsyncHandler} from "../../utils/AsyncHandler.js";
import { getLocationFromIP } from "../../utils/locationService.js"
import { v4 as uuidv4 } from "uuid"

// Track session start
const trackSession = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const {  user_agent, referrer, utm_params, device_info, screen_resolution } = request.body
    const session_id = uuidv4()
    const ip_address = request.ip || request.headers["x-forwarded-for"] || request.connection.remoteAddress
    const location = await getLocationFromIP(ip_address)

    // Check if session already exists
    const existingSession = await SessionTracking.findOne({ session_id })
    if (existingSession) {
        // Update existing session activity
        existingSession.session_data.lastActivity = new Date()
        await existingSession.save()

        return reply
            .code(200)
            .send(new ApiResponse(200, { session_id: existingSession.session_id }, "Session updated successfully"))
    }

    const sessionData = {
        session_id,
        store_id,
        user_id: request.user?._id || null,
        ip_address,
        user_agent: user_agent || request.headers["user-agent"],
        location: {
            country: location?.country,
            country_code: location?.country_code,
            region: location?.region,
            city: location?.city,
            latitude: location?.latitude,
            longitude: location?.longitude,
            timezone: location?.timezone,
        },
        device_info: {
            type: device_info?.type || "desktop",
            browser: device_info?.browser,
            os: device_info?.os,
            screen_resolution,
        },
        referrer: referrer || request.headers.referer,
        utm_params: utm_params || {},
        session_start: new Date(),
        is_active: true,
    }

    const session = await SessionTracking.create(sessionData)

    return reply.code(201).send(new ApiResponse(201, { session_id: session.session_id }, "Session tracked successfully"))
})

// Track product view
const trackProductView = AsyncHandler(async (request, reply) => {
    const { store_id, product_id } = request.params
    const {  view_duration, scroll_depth, interactions, referrer } = request.body || {}
    const session_id= request.body.session_id || request.cookies.session_id || uuidv4()
    console.log(request.body)
    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    // Create product view record
    const viewData = {
        product_id,
        store_id,
        user_id: request.user?._id || null,
        session_id,
        ip_address,
        user_agent: request.headers["user-agent"],
        location: {
            country: location?.country,
            country_code: location?.country_code,
            region: location?.region,
            city: location?.city,
            latitude: location?.latitude,
            longitude: location?.longitude,
        },
        device_info: {
            type: request.body.device_type || "desktop",
            browser: request.body.browser,
            os: request.body.os,
        },
        referrer,
        utm_params: request.body.utm_params || {},
        view_duration: view_duration || 0,
        scroll_depth: scroll_depth || 0,
        interactions: interactions || [],
    }

    await ProductView.create(viewData)

    // Update session with page visit
    if (session_id) {
        await SessionTracking.findOneAndUpdate(
            { session_id },
            {
                $push: {
                    pages_visited: {
                        url: `/products/${product_id}`,
                        title: request.body.page_title || "Product Page",
                        timestamp: new Date(),
                        time_spent: view_duration || 0,
                    },
                },
                $set: {
                    is_bounce: false,
                    is_active: true,
                },
            },
        )
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Product view tracked successfully"))
})

// Track cart event
const trackCartEvent = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const {
        product_id,
        session_id,
        action,
        quantity,
        price,
        variant_id,
        cart_total_before,
        cart_total_after,
        cart_items_count,
    } = request.body

    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    const cartEventData = {
        store_id,
        user_id: request.user?._id || null,
        session_id,
        product_id,
        variant_id,
        action,
        quantity: quantity || 1,
        price,
        total_value: (quantity || 1) * price,
        ip_address,
        user_agent: request.headers["user-agent"],
        location: {
            country: location?.country,
            country_code: location?.country_code,
            region: location?.region,
            city: location?.city,
            latitude: location?.latitude,
            longitude: location?.longitude,
        },
        device_info: {
            type: request.body.device_type || "desktop",
            browser: request.body.browser,
            os: request.body.os,
        },
        referrer: request.headers.referer,
        utm_params: request.body.utm_params || {},
        cart_total_before: cart_total_before || 0,
        cart_total_after: cart_total_after || 0,
        cart_items_count: cart_items_count || 0,
    }

    await CartEvent.create(cartEventData)

    // Update session with conversion event
    if (session_id && action === "add") {
        await SessionTracking.findOneAndUpdate(
            { session_id },
            {
                $push: {
                    conversion_events: {
                        event_type: "cart_add",
                        product_id,
                        value: (quantity || 1) * price,
                        timestamp: new Date(),
                    },
                },
            },
        )
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Cart event tracked successfully"))
})

// Track wishlist event
const trackWishlistEvent = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const { product_id, session_id, action } = request.body

    if (!request.user) {
        throw new ApiError(401, "Authentication required for wishlist tracking")
    }

    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    const wishlistEventData = {
        store_id,
        user_id: request.user._id,
        product_id,
        action,
        ip_address,
        user_agent: request.headers["user-agent"],
        location: {
            country: location?.country,
            country_code: location?.country_code,
            region: location?.region,
            city: location?.city,
            latitude: location?.latitude,
            longitude: location?.longitude,
        },
        device_info: {
            type: request.body.device_type || "desktop",
            browser: request.body.browser,
            os: request.body.os,
        },
        referrer: request.headers.referer,
        utm_params: request.body.utm_params || {},
        conversion_data: {
            purchased: false,
        },
    }

    await WishlistEvent.create(wishlistEventData)

    // Update session with conversion event
    if (session_id && action === "add") {
        await SessionTracking.findOneAndUpdate(
            { session_id },
            {
                $push: {
                    conversion_events: {
                        event_type: "wishlist_add",
                        product_id,
                        timestamp: new Date(),
                    },
                },
            },
        )
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Wishlist event tracked successfully"))
})

// End session
const endSession = AsyncHandler(async (request, reply) => {
    const { session_id } = request.params
    const { session_duration, converted, conversion_value } = request.body

    const session = await SessionTracking.findOne({ session_id })
    if (!session) {
        throw new ApiError(404, "Session not found")
    }

    // Calculate session duration if not provided
    const calculatedDuration = session_duration || Math.floor((new Date() - session.session_start) / 1000)

    // Determine if it's a bounce session (single page view, short duration)
    const isBounce = session.pages_visited.length <= 1 && calculatedDuration < 30

    await SessionTracking.findOneAndUpdate(
        { session_id },
        {
            $set: {
                session_end: new Date(),
                session_duration: calculatedDuration,
                is_active: false,
                is_bounce: isBounce,
            },
        },
    )

    return reply.code(200).send(new ApiResponse(200, {}, "Session ended successfully"))
})

// Get session analytics
const getSessionAnalytics = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const { start_date, end_date, group_by = "day", page = 1, limit = 10 } = request.query

    const matchStage = { store_id }

    if (start_date && end_date) {
        matchStage.session_start = {
            $gte: new Date(start_date),
            $lte: new Date(end_date),
        }
    }

    // Get session statistics
    const sessionStats = await SessionTracking.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                activeSessions: {
                    $sum: { $cond: [{ $eq: ["$is_active", true] }, 1, 0] },
                },
                avgDuration: { $avg: "$session_duration" },
                bounceRate: {
                    $avg: { $cond: [{ $eq: ["$is_bounce", true] }, 1, 0] },
                },
                totalPageViews: { $sum: { $size: "$pages_visited" } },
                totalConversions: { $sum: { $size: "$conversion_events" } },
            },
        },
    ])

    // Get top pages
    const topPages = await SessionTracking.aggregate([
        { $match: matchStage },
        { $unwind: "$pages_visited" },
        {
            $group: {
                _id: "$pages_visited.url",
                visits: { $sum: 1 },
                avgTimeSpent: { $avg: "$pages_visited.time_spent" },
            },
        },
        { $sort: { visits: -1 } },
        { $limit: 10 },
    ])

    // Get traffic sources
    const trafficSources = await SessionTracking.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: {
                    $cond: [
                        { $ne: ["$utm_params.source", null] },
                        "$utm_params.source",
                        { $cond: [{ $ne: ["$referrer", null] }, "referral", "direct"] },
                    ],
                },
                count: { $sum: 1 },
            },
        },
        { $sort: { count: -1 } },
    ])

    // Get device breakdown
    const deviceBreakdown = await SessionTracking.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$device_info.type",
                count: { $sum: 1 },
            },
        },
    ])

    // Get geographic data
    const geographicData = await SessionTracking.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$location.country",
                sessions: { $sum: 1 },
                users: { $addToSet: "$user_id" },
            },
        },
        {
            $addFields: {
                uniqueUsers: { $size: "$users" },
            },
        },
        { $project: { users: 0 } },
        { $sort: { sessions: -1 } },
        { $limit: 10 },
    ])

    return reply.code(200).send(
        new ApiResponse(
            200,
            {
                summary: sessionStats[0] || {},
                topPages,
                trafficSources,
                deviceBreakdown,
                geographicData,
            },
            "Session analytics retrieved successfully",
        ),
    )
})

// Get real-time active sessions
const getActiveSessions = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const { page = 1, limit = 20 } = request.query

    const activeSessions = await SessionTracking.find({
        store_id,
        is_active: true,
    })
        .populate("user_id", "name email")
        .sort({ session_start: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)

    const totalActive = await SessionTracking.countDocuments({
        store_id,
        is_active: true,
    })

    return reply.code(200).send(
        new ApiResponse(
            200,
            {
                sessions: activeSessions,
                pagination: {
                    currentPage: Number.parseInt(page),
                    totalPages: Math.ceil(totalActive / limit),
                    totalSessions: totalActive,
                },
            },
            "Active sessions retrieved successfully",
        ),
    )
})

// Clean up inactive sessions
const cleanupInactiveSessions = AsyncHandler(async (request, reply) => {
    const { store_id } = request.params
    const inactiveThreshold = new Date(Date.now() - 30 * 60 * 1000) // 30 minutes

    const result = await SessionTracking.updateMany(
        {
            store_id,
            is_active: true,
            $or: [{ session_start: { $lt: inactiveThreshold } }, { "pages_visited.timestamp": { $lt: inactiveThreshold } }],
        },
        {
            $set: {
                is_active: false,
                session_end: new Date(),
            },
        },
    )

    return reply.code(200).send(
        new ApiResponse(
            200,
            {
                updatedSessions: result.modifiedCount,
            },
            "Inactive sessions cleaned up successfully",
        ),
    )
})

export {
    trackSession,
    trackProductView,
    trackCartEvent,
    trackWishlistEvent,
    endSession,
    getSessionAnalytics,
    getActiveSessions,
    cleanupInactiveSessions,
}
