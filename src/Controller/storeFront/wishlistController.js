import { Product } from "../../Models/productModel.js"
import { User } from "../../Models/userModel.js"
import { WishlistEvent } from "../../Models/wishlistEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { getLocationFromIP } from "../../utils/locationService.js"
import mongoose from "mongoose"

// Add product to wishlist
const addToWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id } = request.body
    const user_id = request.user._id
    const clientIP = request.ip || request.headers["x-forwarded-for"]

    if (!product_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Product ID is required"))
    }

    // Verify product exists and belongs to store
    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
      is_published: true,
    })

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    // Get user and update wishlist
    const user = await User.findById(user_id)
    if (!user) {
      return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
    }

    // Check if product already in wishlist
    const existingWishlistItem = user.wishlist.find(
      (item) => item.product_id.toString() === product_id && item.store_id.toString() === store_id,
    )

    if (existingWishlistItem) {
      return reply.code(400).send(new ApiResponse(400, {}, "Product already in wishlist"))
    }

    // Add to wishlist
    user.wishlist.push({
      product_id: new mongoose.Types.ObjectId(product_id),
      store_id: new mongoose.Types.ObjectId(store_id),
      added_at: new Date(),
    })

    await user.save()

    // Track wishlist event
    try {
      const location = await getLocationFromIP(clientIP)
      await WishlistEvent.create({
        store_id: new mongoose.Types.ObjectId(store_id),
        user_id: new mongoose.Types.ObjectId(user_id),
        product_id: new mongoose.Types.ObjectId(product_id),
        action: "add",
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
      })
    } catch (trackingError) {
      request.log?.warn?.("Failed to track wishlist event:", trackingError)
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Product added to wishlist successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error adding product to wishlist"))
  }
}

// Get user's wishlist for a store
const getWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params
    const user_id = request.user._id
    const { page = 1, limit = 20 } = request.query

    const user = await User.findById(user_id).populate({
      path: "wishlist.product_id",
      match: { is_active: true, is_published: true },
      select: "name price discount_price images stock category_id",
      populate: {
        path: "category_id",
        select: "name",
      },
    })

    if (!user) {
      return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
    }

    // Filter wishlist items for the specific store and remove null products
    const storeWishlist = user.wishlist
      .filter((item) => item.store_id.toString() === store_id && item.product_id)
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))

    // Pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)
    const paginatedWishlist = storeWishlist.slice(skip, skip + Number.parseInt(limit))

    const total = storeWishlist.length
    const totalPages = Math.ceil(total / Number.parseInt(limit))

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          wishlist: paginatedWishlist,
          pagination: {
            current_page: Number.parseInt(page),
            total_pages: totalPages,
            total_items: total,
            items_per_page: Number.parseInt(limit),
            has_next: Number.parseInt(page) < totalPages,
            has_prev: Number.parseInt(page) > 1,
          },
        },
        "Wishlist fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching wishlist"))
  }
}

// Remove product from wishlist
const removeFromWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id } = request.body
    const user_id = request.user._id
    const clientIP = request.ip || request.headers["x-forwarded-for"]

    if (!product_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Product ID is required"))
    }

    const user = await User.findById(user_id)
    if (!user) {
      return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
    }

    // Remove from wishlist
    const initialLength = user.wishlist.length
    user.wishlist = user.wishlist.filter(
      (item) => !(item.product_id.toString() === product_id && item.store_id.toString() === store_id),
    )

    if (user.wishlist.length === initialLength) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found in wishlist"))
    }

    await user.save()

    // Track wishlist event
    try {
      const location = await getLocationFromIP(clientIP)
      await WishlistEvent.create({
        store_id: new mongoose.Types.ObjectId(store_id),
        user_id: new mongoose.Types.ObjectId(user_id),
        product_id: new mongoose.Types.ObjectId(product_id),
        action: "remove",
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
      })
    } catch (trackingError) {
      request.log?.warn?.("Failed to track wishlist event:", trackingError)
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Product removed from wishlist successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error removing product from wishlist"))
  }
}

// Clear entire wishlist for a store
const clearWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params
    const user_id = request.user._id

    const user = await User.findById(user_id)
    if (!user) {
      return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
    }

    // Remove all items for this store
    user.wishlist = user.wishlist.filter((item) => item.store_id.toString() !== store_id)
    await user.save()

    return reply.code(200).send(new ApiResponse(200, {}, "Wishlist cleared successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error clearing wishlist"))
  }
}

// Check if product is in wishlist
const checkWishlistStatus = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const user_id = request.user._id

    const user = await User.findById(user_id)
    if (!user) {
      return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
    }

    const isInWishlist = user.wishlist.some(
      (item) => item.product_id.toString() === product_id && item.store_id.toString() === store_id,
    )

    return reply.code(200).send(new ApiResponse(200, { is_in_wishlist: isInWishlist }, "Wishlist status checked"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error checking wishlist status"))
  }
}

export { addToWishlist, getWishlist, removeFromWishlist, clearWishlist, checkWishlistStatus }
