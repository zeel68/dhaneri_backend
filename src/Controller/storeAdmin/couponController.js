import { Coupon } from "../../Models/couponModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get all coupons for store
const getStoreCoupons = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { page = 1, limit = 10, search, status, type, sort = "created_at", order = "desc" } = request.query
    console.log(request.user);

    const skip = (page - 1) * limit
    const filter = { store_id: new mongoose.Types.ObjectId(storeId) }

    // Apply filters
    if (status && status !== "all") {
      filter.is_active = status === "active"
    }
    if (type && type !== "all") {
      filter.type = type
    }
    if (search) {
      filter.$or = [{ code: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }]
    }

    // Build sort object
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1

    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort(sortObj).skip(skip).limit(Number(limit)),
      Coupon.countDocuments(filter),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          coupons,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        "Coupons fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching coupons"))
  }
}

// Get single coupon
const getCouponById = async (request, reply) => {
  try {
    const { couponId } = request.params
    const storeId = request.user.store_id

    const coupon = await Coupon.findOne({ _id: couponId, store_id: storeId })

    if (!coupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Coupon not found"))
    }

    return reply.code(200).send(new ApiResponse(200, coupon, "Coupon details fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching coupon details"))
  }
}

// Create new coupon
const createCoupon = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const {
      code,
      description,
      type,
      value,
      minimum_order_amount,
      maximum_discount_amount,
      usage_limit,
      start_date,
      end_date,
      applicable_products,
      applicable_categories,
    } = request.body

    if (!code || !description || !type) {
      if (type != "free_shipping")
        return reply.code(400).send(new ApiResponse(400, {}, "Code, description, type, and value are required"))
      else if (!value)
        return reply.code(400).send(new ApiResponse(400, {}, "Code, description, type,value are required"))

    }

    // Check if coupon code already exists for this store
    const existingCoupon = await Coupon.findOne({ code, store_id: storeId })
    if (existingCoupon) {
      return reply.code(409).send(new ApiResponse(409, {}, "Coupon code already exists"))
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      type,
      value,
      minimum_order_amount,
      maximum_discount_amount,
      usage_limit,
      start_date,
      end_date,
      applicable_products,
      applicable_categories,
      store_id: storeId,
      usage_count: 0,
      is_active: true,
    })

    return reply.code(201).send(new ApiResponse(201, coupon, "Coupon created successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error creating coupon"))
  }
}

// Update coupon
const updateCoupon = async (request, reply) => {
  try {
    const { couponId } = request.params
    const storeId = request.user.store_id
    const updateData = { ...request.body, updated_at: new Date() }

    // If updating code, check for duplicates
    if (updateData.code) {
      const existingCoupon = await Coupon.findOne({
        code: updateData.code.toUpperCase(),
        store_id: storeId,
        _id: { $ne: couponId },
      })
      if (existingCoupon) {
        return reply.code(409).send(new ApiResponse(409, {}, "Coupon code already exists"))
      }
      updateData.code = updateData.code.toUpperCase()
    }

    const updatedCoupon = await Coupon.findOneAndUpdate({ _id: couponId, store_id: storeId }, updateData, { new: true })

    if (!updatedCoupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Coupon not found"))
    }

    return reply.code(200).send(new ApiResponse(200, updatedCoupon, "Coupon updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating coupon"))
  }
}

// Delete coupon
const deleteCoupon = async (request, reply) => {
  try {
    const { couponId } = request.params
    const storeId = request.user.store_id

    const deletedCoupon = await Coupon.findOneAndDelete({ _id: couponId, store_id: storeId })

    if (!deletedCoupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Coupon not found"))
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Coupon deleted successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error deleting coupon"))
  }
}

// Duplicate coupon
const duplicateCoupon = async (request, reply) => {
  try {
    const { couponId } = request.params
    const storeId = request.user.store_id

    const originalCoupon = await Coupon.findOne({ _id: couponId, store_id: storeId })
    if (!originalCoupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Coupon not found"))
    }

    // Generate new code
    const newCode = `${originalCoupon.code}-COPY-${Date.now()}`

    const duplicatedCoupon = await Coupon.create({
      ...originalCoupon.toObject(),
      _id: undefined,
      code: newCode,
      usage_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    })

    return reply.code(201).send(new ApiResponse(201, duplicatedCoupon, "Coupon duplicated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error duplicating coupon"))
  }
}

export { getStoreCoupons, getCouponById, createCoupon, updateCoupon, deleteCoupon, duplicateCoupon }
