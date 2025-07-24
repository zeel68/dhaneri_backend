import { Order } from "../../Models/orderModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get all orders for store
const getStoreOrders = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const {
      page = 1,
      limit = 20,
      search = "",
      status = "all",
      payment_status = "all",
      date_from,
      date_to,
      sort = "created_at",
      order = "desc",
    } = request.query

    const filter = { store_id: new mongoose.Types.ObjectId(storeId) }

    // Search filter
    if (search) {
      filter.$or = [
        { order_number: { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.email": { $regex: search, $options: "i" } },
      ]
    }

    // Status filters
    if (status && status !== "all") {
      filter.status = status
    }

    if (payment_status && payment_status !== "all") {
      filter.payment_status = payment_status
    }

    // Date range filter
    if (date_from || date_to) {
      filter.created_at = {}
      if (date_from) filter.created_at.$gte = new Date(date_from)
      if (date_to) filter.created_at.$lte = new Date(date_to)
    }

    // Pagination
    const skip = (page - 1) * limit
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1

    const [orders, total] = await Promise.all([
      Order.find(filter).populate("user_id", "name email phone").sort(sortObj).skip(skip).limit(Number.parseInt(limit)),
      Order.countDocuments(filter),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          orders,
          pagination: {
            page: Number.parseInt(page),
            limit: Number.parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        },
        "Orders fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching orders"))
  }
}

// Get single order by ID
const getOrderById = async (request, reply) => {
  try {
    const { orderId } = request.params
    const storeId = request.user.store_id

    const order = await Order.findOne({
      _id: orderId,
      store_id: storeId,
    })
      .populate("user_id", "name email phone address")
      .populate("items.product_id", "name images sku")

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    return reply.code(200).send(new ApiResponse(200, order, "Order fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching order"))
  }
}

// Update order status
const updateOrderStatus = async (request, reply) => {
  try {
    const { orderId } = request.params
    const { status, tracking_number, notes } = request.body
    const storeId = request.user.store_id

    const validStatuses = ["pending", "processing", "shipped", "delivered", "cancelled", "refunded"]
    if (!validStatuses.includes(status)) {
      return reply.code(400).send(new ApiResponse(400, {}, "Invalid order status"))
    }

    const updateData = { status, updated_at: new Date() }
    if (tracking_number) updateData.tracking_number = tracking_number
    if (notes) updateData.notes = notes

    const order = await Order.findOneAndUpdate({ _id: orderId, store_id: storeId }, updateData, { new: true }).populate(
      "user_id",
      "name email",
    )

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    // TODO: Send notification email to customer about status update

    return reply.code(200).send(new ApiResponse(200, order, "Order status updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating order status"))
  }
}

// Update order details
const updateOrder = async (request, reply) => {
  try {
    const { orderId } = request.params
    const updateData = request.body
    const storeId = request.user.store_id

    // Remove fields that shouldn't be updated directly
    delete updateData._id
    delete updateData.store_id
    delete updateData.created_at

    updateData.updated_at = new Date()

    const order = await Order.findOneAndUpdate({ _id: orderId, store_id: storeId }, updateData, { new: true }).populate(
      "user_id",
      "name email",
    )

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    return reply.code(200).send(new ApiResponse(200, order, "Order updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating order"))
  }
}

export { getStoreOrders, getOrderById, updateOrderStatus, updateOrder }
