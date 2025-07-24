import { SessionTracking } from "../../Models/sessionTrackingModel.js"
import { ProductView } from "../../Models/productViewModel.js"
import { CartEvent } from "../../Models/cartEventModel.js"
import { WishlistEvent } from "../../Models/wishlistEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { getLocationFromIP } from "../../utils/locationService.js"

// Track session start
const trackSession = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { session_id, user_agent, referrer, utm_params, device_info, screen_resolution } = request.body

    const ip_address = request.ip || request.headers["x-forwarded-for"] || request.connection.remoteAddress

    // Get location from IP
    const location = await getLocationFromIP(ip_address)

    const sessionData = {
      session_id,
      store_id,
      user_id: request.user?._id || null,
      ip_address,
      user_agent,
      location,
      device_info: {
        ...device_info,
        screen_resolution,
      },
      referrer: {
        source: referrer?.source || "direct",
        medium: referrer?.medium || "none",
        campaign: referrer?.campaign,
        url: referrer?.url,
      },
      utm_params: utm_params || {},
    }

    const session = await SessionTracking.create(sessionData)

    return reply
      .code(200)
      .send(new ApiResponse(200, { session_id: session.session_id }, "Session tracked successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error tracking session"))
  }
}

// Track product view
const trackProductView = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const { session_id, view_duration, scroll_depth, images_viewed, variant_viewed, referrer_url } = request.body

    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    const viewData = {
      store_id,
      product_id,
      user_id: request.user?._id || null,
      session_id,
      ip_address,
      user_agent: request.headers["user-agent"],
      referrer_url,
      view_duration: view_duration || 0,
      scroll_depth: scroll_depth || 0,
      images_viewed: images_viewed || [],
      variant_viewed,
      location: {
        country: location?.country,
        city: location?.city,
        region: location?.region,
      },
      device_type: request.body.device_type,
      utm_params: request.body.utm_params || {},
    }

    await ProductView.create(viewData)

    // Update session page views
    await SessionTracking.findOneAndUpdate(
      { session_id },
      {
        $inc: { page_views: 1 },
        $set: {
          last_activity: new Date(),
          is_bounce: false,
        },
      },
    )

    return reply.code(200).send(new ApiResponse(200, {}, "Product view tracked successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error tracking product view"))
  }
}

// Track cart event
const trackCartEvent = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id, session_id, event_type, quantity, price_at_event, variant_id } = request.body

    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    const cartEventData = {
      store_id,
      product_id,
      user_id: request.user?._id || null,
      session_id,
      event_type,
      quantity: quantity || 1,
      price_at_event,
      variant_id,
      ip_address,
      location: {
        country: location?.country,
        city: location?.city,
        region: location?.region,
      },
      utm_params: request.body.utm_params || {},
      device_type: request.body.device_type,
    }

    await CartEvent.create(cartEventData)

    return reply.code(200).send(new ApiResponse(200, {}, "Cart event tracked successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error tracking cart event"))
  }
}

// Track wishlist event
const trackWishlistEvent = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id, session_id, event_type } = request.body

    const ip_address = request.ip || request.headers["x-forwarded-for"]
    const location = await getLocationFromIP(ip_address)

    const wishlistEventData = {
      store_id,
      product_id,
      user_id: request.user?._id || null,
      session_id,
      event_type,
      ip_address,
      location: {
        country: location?.country,
        city: location?.city,
        region: location?.region,
      },
      utm_params: request.body.utm_params || {},
      device_type: request.body.device_type,
    }

    await WishlistEvent.create(wishlistEventData)

    return reply.code(200).send(new ApiResponse(200, {}, "Wishlist event tracked successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error tracking wishlist event"))
  }
}

// Update session end
const endSession = async (request, reply) => {
  try {
    const { session_id } = request.params
    const { session_duration, converted, conversion_value } = request.body

    await SessionTracking.findOneAndUpdate(
      { session_id },
      {
        $set: {
          session_duration,
          converted: converted || false,
          conversion_value: conversion_value || 0,
          ended_at: new Date(),
        },
      },
    )

    return reply.code(200).send(new ApiResponse(200, {}, "Session ended successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error ending session"))
  }
}

export { trackSession, trackProductView, trackCartEvent, trackWishlistEvent, endSession }
