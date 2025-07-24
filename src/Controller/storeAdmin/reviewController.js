import { Product } from "../../Models/productModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get all reviews for store products
const getStoreReviews = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const {
      page = 1,
      limit = 10,
      product_id,
      status,
      rating,
      search,
      sort = "created_at",
      order = "desc",
    } = request.query

    const skip = (page - 1) * limit

    // First get all products for this store
    const storeProducts = await Product.find({ store_id: storeId }).select("_id")
    const productIds = storeProducts.map((p) => p._id)

    const matchFilter = {
      "reviews.user": { $exists: true },
    }

    if (product_id) {
      matchFilter._id = new mongoose.Types.ObjectId(product_id)
    } else {
      matchFilter._id = { $in: productIds }
    }

    const pipeline = [
      { $match: matchFilter },
      { $unwind: "$reviews" },
      {
        $lookup: {
          from: "users",
          localField: "reviews.user",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $project: {
          _id: "$reviews._id",
          product_id: "$_id",
          product_name: "$name",
          customer_id: "$customer._id",
          customer_name: "$customer.name",
          customer_avatar: "$customer.profile_url",
          rating: "$reviews.rating",
          title: "$reviews.title",
          comment: "$reviews.comment",
          images: "$reviews.images",
          status: { $ifNull: ["$reviews.status", "published"] },
          helpful_count: { $ifNull: ["$reviews.helpful_count", 0] },
          verified_purchase: { $ifNull: ["$reviews.verified_purchase", false] },
          reply: "$reviews.reply",
          created_at: "$reviews.date",
          updated_at: "$reviews.updated_at",
        },
      },
    ]

    // Apply filters
    const additionalMatch = {}
    if (status && status !== "all") {
      additionalMatch.status = status
    }
    if (rating) {
      additionalMatch.rating = Number(rating)
    }
    if (search) {
      additionalMatch.$or = [
        { product_name: { $regex: search, $options: "i" } },
        { customer_name: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } },
      ]
    }

    if (Object.keys(additionalMatch).length > 0) {
      pipeline.push({ $match: additionalMatch })
    }

    // Add sorting
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1
    pipeline.push({ $sort: sortObj })

    // Add pagination
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: Number(limit) })

    const [reviews, totalCount] = await Promise.all([
      Product.aggregate(pipeline),
      Product.aggregate([
        ...pipeline.slice(0, -2), // Remove skip and limit
        { $count: "total" },
      ]),
    ])

    const total = totalCount[0]?.total || 0

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          reviews,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        "Reviews fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching reviews"))
  }
}

// Update review status
const updateReviewStatus = async (request, reply) => {
  try {
    const { reviewId } = request.params
    const { status } = request.body
    const storeId = request.user.store_id

    if (!status || !["pending", "published", "hidden"].includes(status)) {
      return reply.code(400).send(new ApiResponse(400, {}, "Valid status is required"))
    }

    // Find the product that contains this review and belongs to the store
    const product = await Product.findOneAndUpdate(
      {
        store_id: storeId,
        "reviews._id": new mongoose.Types.ObjectId(reviewId),
      },
      {
        $set: {
          "reviews.$.status": status,
          "reviews.$.updated_at": new Date(),
        },
      },
      { new: true },
    )

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    const updatedReview = product.reviews.find((r) => r._id.toString() === reviewId)

    return reply.code(200).send(new ApiResponse(200, updatedReview, "Review status updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating review status"))
  }
}

// Reply to review
const replyToReview = async (request, reply) => {
  try {
    const { reviewId } = request.params
    const { message } = request.body
    const storeId = request.user.store_id

    if (!message?.trim()) {
      return reply.code(400).send(new ApiResponse(400, {}, "Reply message is required"))
    }

    const product = await Product.findOneAndUpdate(
      {
        store_id: storeId,
        "reviews._id": new mongoose.Types.ObjectId(reviewId),
      },
      {
        $set: {
          "reviews.$.reply": {
            message: message.trim(),
            replied_by: "Store Admin",
            replied_at: new Date(),
          },
          "reviews.$.updated_at": new Date(),
        },
      },
      { new: true },
    )

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    const updatedReview = product.reviews.find((r) => r._id.toString() === reviewId)

    return reply.code(200).send(new ApiResponse(200, updatedReview, "Reply added successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error replying to review"))
  }
}

// Delete review
const deleteReview = async (request, reply) => {
  try {
    const { reviewId } = request.params
    const storeId = request.user.store_id

    const product = await Product.findOneAndUpdate(
      {
        store_id: storeId,
        "reviews._id": new mongoose.Types.ObjectId(reviewId),
      },
      {
        $pull: {
          reviews: { _id: new mongoose.Types.ObjectId(reviewId) },
        },
      },
      { new: true },
    )

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Review deleted successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error deleting review"))
  }
}

export { getStoreReviews, updateReviewStatus, replyToReview, deleteReview }
