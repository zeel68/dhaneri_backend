import { User } from "../../Models/userModel.js"
import { Order } from "../../Models/orderModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get all customers for store
const getStoreCustomers = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { page = 1, limit = 20, search = "", status = "all", sort = "created_at", order = "desc" } = request.query

    const filter = { store_id: new mongoose.Types.ObjectId(storeId) }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone_number: { $regex: search, $options: "i" } },
      ]
    }

    // Status filter
    if (status && status !== "all") {
      filter.is_active = status === "active"
    }

    // Pagination
    const skip = (page - 1) * limit
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1

    const [customers, total] = await Promise.all([
      User.aggregate([
        { $match: filter },
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
            total_orders: { $size: "$orders" },
            total_spent: { $sum: "$orders.total_amount" },
            average_order_value: {
              $cond: [
                { $gt: [{ $size: "$orders" }, 0] },
                { $divide: [{ $sum: "$orders.total_amount" }, { $size: "$orders" }] },
                0,
              ],
            },
            last_order_date: { $max: "$orders.created_at" },
          },
        },
        { $sort: sortObj },
        { $skip: skip },
        { $limit: Number.parseInt(limit) },
        {
          $project: {
            name: 1,
            email: 1,
            phone_number: 1,
            profile_url: 1,
            is_active: 1,
            created_at: 1,
            last_login: 1,
            total_orders: 1,
            total_spent: 1,
            average_order_value: 1,
            last_order_date: 1,
          },
        },
      ]),
      User.countDocuments(filter),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          customers,
          pagination: {
            page: Number.parseInt(page),
            limit: Number.parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        },
        "Customers fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customers"))
  }
}

// Get single customer by ID
const getCustomerById = async (request, reply) => {
  try {
    const { customerId } = request.params
    const storeId = request.user.store_id

    const customer = await User.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(customerId),
          store_id: new mongoose.Types.ObjectId(storeId),
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "user_id",
          as: "orders",
        },
      },
      {
        $lookup: {
          from: "sessiontrackings",
          localField: "_id",
          foreignField: "user_id",
          as: "sessions",
        },
      },
      {
        $addFields: {
          total_orders: { $size: "$orders" },
          total_spent: { $sum: "$orders.total_amount" },
          average_order_value: {
            $cond: [
              { $gt: [{ $size: "$orders" }, 0] },
              { $divide: [{ $sum: "$orders.total_amount" }, { $size: "$orders" }] },
              0,
            ],
          },
          last_order_date: { $max: "$orders.created_at" },
          total_sessions: { $size: "$sessions" },
          last_session: { $max: "$sessions.created_at" },
        },
      },
      {
        $project: {
          password: 0,
          refresh_token: 0,
          email_verification_otp: 0,
          password_reset_otp: 0,
        },
      },
    ])

    if (!customer || customer.length === 0) {
      return reply.code(404).send(new ApiResponse(404, {}, "Customer not found"))
    }

    return reply.code(200).send(new ApiResponse(200, customer[0], "Customer fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching customer"))
  }
}

// Create new customer
const createCustomer = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const customerData = {
      ...request.body,
      store_id: storeId,
      role_id: "6861734f5f118d3ee1451327", // Default customer role
    }

    const customer = await User.create(customerData)

    return reply.code(201).send(new ApiResponse(201, customer, "Customer created successfully"))
  } catch (error) {
    if (error.code === 11000) {
      return reply.code(400).send(new ApiResponse(400, {}, "Email or phone number already exists"))
    }
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error creating customer"))
  }
}

// Update customer
const updateCustomer = async (request, reply) => {
  try {
    const { customerId } = request.params
    const storeId = request.user.store_id
    const updateData = request.body

    // Remove fields that shouldn't be updated
    delete updateData._id
    delete updateData.store_id
    delete updateData.password
    delete updateData.refresh_token

    const customer = await User.findOneAndUpdate(
      { _id: customerId, store_id: storeId },
      { ...updateData, updated_at: new Date() },
      { new: true },
    ).select("-password -refresh_token")

    if (!customer) {
      return reply.code(404).send(new ApiResponse(404, {}, "Customer not found"))
    }

    return reply.code(200).send(new ApiResponse(200, customer, "Customer updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating customer"))
  }
}

// Delete customer
const deleteCustomer = async (request, reply) => {
  try {
    const { customerId } = request.params
    const storeId = request.user.store_id

    // Check if customer has orders
    const orderCount = await Order.countDocuments({ user_id: customerId })
    if (orderCount > 0) {
      return reply
        .code(400)
        .send(new ApiResponse(400, {}, "Cannot delete customer with existing orders. Deactivate instead."))
    }

    const customer = await User.findOneAndDelete({
      _id: customerId,
      store_id: storeId,
    })

    if (!customer) {
      return reply.code(404).send(new ApiResponse(404, {}, "Customer not found"))
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Customer deleted successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error deleting customer"))
  }
}

export { getStoreCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer }
