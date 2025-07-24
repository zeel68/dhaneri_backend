import { Product } from "../../Models/productModel.js"
import { Order } from "../../Models/orderModel.js"
import { User } from "../../Models/userModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Add product review
const addProductReview = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const { rating, comment, title } = request.body
    const user_id = request.user._id

    if (!rating || rating < 1 || rating > 5) {
      return reply.code(400).send(new ApiResponse(400, {}, "Rating must be between 1 and 5"))
    }

    // Verify product exists
    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    })

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    // Check if user has purchased this product
    const hasPurchased = await Order.findOne({
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
      "items.product_id": new mongoose.Types.ObjectId(product_id),
      status: { $in: ["delivered", "completed"] },
    })

    if (!hasPurchased) {
      return reply.code(400).send(new ApiResponse(400, {}, "You can only review products you have purchased"))
    }

    // Check if user already reviewed this product
    const existingReview = product.reviews.find((review) => review.user_id.toString() === user_id.toString())

    if (existingReview) {
      return reply.code(400).send(new ApiResponse(400, {}, "You have already reviewed this product"))
    }

    // Get user info
    const user = await User.findById(user_id).select("name")

    // Add review to product
    const newReview = {
      user_id: new mongoose.Types.ObjectId(user_id),
      user_name: user.name,
      rating,
      comment: comment || "",
      title: title || "",
      status: "pending", // Reviews need approval
      created_at: new Date(),
    }

    product.reviews.push(newReview)

    // Recalculate average rating
    const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0)
    product.average_rating = totalRating / product.reviews.length
    product.review_count = product.reviews.length

    await product.save()

    return reply.code(201).send(new ApiResponse(201, { review: newReview }, "Review added successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error adding review"))
  }
}

// Get product reviews
const getProductReviews = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const { page = 1, limit = 10, rating_filter, sort = "newest" } = request.query

    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    }).select("reviews average_rating review_count")

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    let reviews = product.reviews.filter((review) => review.status === "approved")

    // Filter by rating if specified
    if (rating_filter && Number.parseInt(rating_filter) >= 1 && Number.parseInt(rating_filter) <= 5) {
      reviews = reviews.filter((review) => review.rating === Number.parseInt(rating_filter))
    }

    // Sort reviews
    switch (sort) {
      case "newest":
        reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        break
      case "oldest":
        reviews.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        break
      case "highest_rating":
        reviews.sort((a, b) => b.rating - a.rating)
        break
      case "lowest_rating":
        reviews.sort((a, b) => a.rating - b.rating)
        break
      default:
        reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    // Pagination
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)
    const paginatedReviews = reviews.slice(skip, skip + Number.parseInt(limit))

    const total = reviews.length
    const totalPages = Math.ceil(total / Number.parseInt(limit))

    // Calculate rating distribution
    const ratingDistribution = {
      5: reviews.filter((r) => r.rating === 5).length,
      4: reviews.filter((r) => r.rating === 4).length,
      3: reviews.filter((r) => r.rating === 3).length,
      2: reviews.filter((r) => r.rating === 2).length,
      1: reviews.filter((r) => r.rating === 1).length,
    }

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          reviews: paginatedReviews,
          summary: {
            average_rating: product.average_rating,
            total_reviews: product.review_count,
            rating_distribution: ratingDistribution,
          },
          pagination: {
            current_page: Number.parseInt(page),
            total_pages: totalPages,
            total_items: total,
            items_per_page: Number.parseInt(limit),
            has_next: Number.parseInt(page) < totalPages,
            has_prev: Number.parseInt(page) > 1,
          },
        },
        "Product reviews fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product reviews"))
  }
}

// Update product review
const updateProductReview = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const { rating, comment, title } = request.body
    const user_id = request.user._id

    if (rating && (rating < 1 || rating > 5)) {
      return reply.code(400).send(new ApiResponse(400, {}, "Rating must be between 1 and 5"))
    }

    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    })

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    // Find user's review
    const reviewIndex = product.reviews.findIndex((review) => review.user_id.toString() === user_id.toString())

    if (reviewIndex === -1) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    // Update review
    if (rating) product.reviews[reviewIndex].rating = rating
    if (comment !== undefined) product.reviews[reviewIndex].comment = comment
    if (title !== undefined) product.reviews[reviewIndex].title = title
    product.reviews[reviewIndex].updated_at = new Date()
    product.reviews[reviewIndex].status = "pending" // Re-approval needed after edit

    // Recalculate average rating
    const approvedReviews = product.reviews.filter((review) => review.status === "approved")
    if (approvedReviews.length > 0) {
      const totalRating = approvedReviews.reduce((sum, review) => sum + review.rating, 0)
      product.average_rating = totalRating / approvedReviews.length
      product.review_count = approvedReviews.length
    }

    await product.save()

    return reply
      .code(200)
      .send(new ApiResponse(200, { review: product.reviews[reviewIndex] }, "Review updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating review"))
  }
}

// Delete product review
const deleteProductReview = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const user_id = request.user._id

    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    })

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    // Find and remove user's review
    const reviewIndex = product.reviews.findIndex((review) => review.user_id.toString() === user_id.toString())

    if (reviewIndex === -1) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    product.reviews.splice(reviewIndex, 1)

    // Recalculate average rating
    const approvedReviews = product.reviews.filter((review) => review.status === "approved")
    if (approvedReviews.length > 0) {
      const totalRating = approvedReviews.reduce((sum, review) => sum + review.rating, 0)
      product.average_rating = totalRating / approvedReviews.length
      product.review_count = approvedReviews.length
    } else {
      product.average_rating = 0
      product.review_count = 0
    }

    await product.save()

    return reply.code(200).send(new ApiResponse(200, {}, "Review deleted successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error deleting review"))
  }
}

// Get user's review for a product
const getUserProductReview = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const user_id = request.user._id

    const product = await Product.findOne({
      _id: product_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    }).select("reviews")

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    const userReview = product.reviews.find((review) => review.user_id.toString() === user_id.toString())

    if (!userReview) {
      return reply.code(404).send(new ApiResponse(404, {}, "Review not found"))
    }

    return reply.code(200).send(new ApiResponse(200, { review: userReview }, "User review fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching user review"))
  }
}

export { addProductReview, getProductReviews, updateProductReview, deleteProductReview, getUserProductReview }
