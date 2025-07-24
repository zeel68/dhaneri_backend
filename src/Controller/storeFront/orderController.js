import { Order } from "../../Models/orderModel.js"
import { Cart } from "../../Models/cartModel.js"
import { Product } from "../../Models/productModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { generateOrderNumber } from "../../utils/helpers.js"
import mongoose from "mongoose"

// Create new order
const createOrder = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { shipping_address, billing_address, payment_method, notes, use_cart = true } = request.body
    const user_id = request.user._id

    if (!shipping_address) {
      return reply.code(400).send(new ApiResponse(400, {}, "Shipping address is required"))
    }

    const orderItems = []
    let subtotal = 0

    if (use_cart) {
      // Get items from user's cart
      const cart = await Cart.findOne({
        user_id,
        store_id: new mongoose.Types.ObjectId(store_id),
      }).populate("items.product_id", "name price discount_price stock")

      if (!cart || cart.items.length === 0) {
        return reply.code(400).send(new ApiResponse(400, {}, "Cart is empty"))
      }

      // Validate stock and prepare order items
      for (const item of cart.items) {
        if (!item.product_id) {
          return reply.code(400).send(new ApiResponse(400, {}, "Some products in cart are no longer available"))
        }

        if (item.product_id.stock.quantity < item.quantity) {
          return reply.code(400).send(new ApiResponse(400, {}, `Insufficient stock for ${item.product_id.name}`))
        }

        const itemPrice = item.product_id.discount_price || item.product_id.price
        const itemTotal = itemPrice * item.quantity

        orderItems.push({
          product_id: item.product_id._id,
          quantity: item.quantity,
          price: itemPrice,
          total: itemTotal,
        })

        subtotal += itemTotal
      }
    } else {
      // Direct order (items provided in request)
      const { items } = request.body
      if (!items || items.length === 0) {
        return reply.code(400).send(new ApiResponse(400, {}, "Order items are required"))
      }

      for (const item of items) {
        const product = await Product.findById(item.product_id)
        if (!product || !product.is_active) {
          return reply.code(400).send(new ApiResponse(400, {}, `Product ${item.product_id} not found`))
        }

        if (product.stock.quantity < item.quantity) {
          return reply.code(400).send(new ApiResponse(400, {}, `Insufficient stock for ${product.name}`))
        }

        const itemPrice = product.discount_price || product.price
        const itemTotal = itemPrice * item.quantity

        orderItems.push({
          product_id: product._id,
          quantity: item.quantity,
          price: itemPrice,
          total: itemTotal,
        })

        subtotal += itemTotal
      }
    }

    // Calculate totals
    const taxRate = 0.1 // 10% tax (you can make this configurable)
    const tax = subtotal * taxRate
    const shippingCost = subtotal > 50 ? 0 : 10 // Free shipping over $50
    const total = subtotal + tax + shippingCost

    // Generate order number
    const orderNumber = generateOrderNumber()

    // Create order
    const order = await Order.create({
      order_number: orderNumber,
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
      items: orderItems,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping_cost: shippingCost,
      total: Math.round(total * 100) / 100,
      shipping_address,
      billing_address: billing_address || shipping_address,
      payment_method,
      notes,
      status: "pending",
      payment_status: "pending",
    })

    // Update product stock
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { "stock.quantity": -item.quantity },
      })
    }

    // Clear cart if used
    if (use_cart) {
      await Cart.findOneAndUpdate(
        { user_id, store_id: new mongoose.Types.ObjectId(store_id) },
        { $set: { items: [], coupon_id: null, subtotal: 0, total: 0 } },
      )
    }

    const populatedOrder = await Order.findById(order._id)
      .populate("items.product_id", "name images")
      .populate("user_id", "name email phone_number")

    return reply.code(201).send(new ApiResponse(201, { order: populatedOrder }, "Order created successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error creating order"))
  }
}

// Get user's orders for a store
const getUserOrders = async (request, reply) => {
  try {
    const { store_id } = request.params
    const user_id = request.user._id
    const { page = 1, limit = 10, status } = request.query

    const filter = {
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
    }

    if (status && status !== "all") {
      filter.status = status
    }

    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const orders = await Order.find(filter)
      .populate("items.product_id", "name images")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))
      .select("-__v")

    const total = await Order.countDocuments(filter)
    const totalPages = Math.ceil(total / Number.parseInt(limit))

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          orders,
          pagination: {
            current_page: Number.parseInt(page),
            total_pages: totalPages,
            total_items: total,
            items_per_page: Number.parseInt(limit),
            has_next: Number.parseInt(page) < totalPages,
            has_prev: Number.parseInt(page) > 1,
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

// Get order details
const getOrderDetails = async (request, reply) => {
  try {
    const { store_id, order_id } = request.params
    const user_id = request.user._id

    const order = await Order.findOne({
      _id: order_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
    })
      .populate("items.product_id", "name images price discount_price")
      .populate("user_id", "name email phone_number")

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    return reply.code(200).send(new ApiResponse(200, { order }, "Order details fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching order details"))
  }
}

// Cancel order
const cancelOrder = async (request, reply) => {
  try {
    const { store_id, order_id } = request.params
    const { reason } = request.body
    const user_id = request.user._id

    const order = await Order.findOne({
      _id: order_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
    })

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    // Check if order can be cancelled
    if (!["pending", "confirmed"].includes(order.status)) {
      return reply.code(400).send(new ApiResponse(400, {}, "Order cannot be cancelled at this stage"))
    }

    // Update order status
    order.status = "cancelled"
    order.cancelled_at = new Date()
    order.cancellation_reason = reason || "Cancelled by customer"
    await order.save()

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { "stock.quantity": item.quantity },
      })
    }

    return reply.code(200).send(new ApiResponse(200, { order }, "Order cancelled successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error cancelling order"))
  }
}

// Track order by order number
const trackOrder = async (request, reply) => {
  try {
    const { store_id, order_number } = request.params

    const order = await Order.findOne({
      order_number,
      store_id: new mongoose.Types.ObjectId(store_id),
    })
      .populate("items.product_id", "name images")
      .select("order_number status payment_status tracking_number estimated_delivery created_at updated_at")

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found"))
    }

    // Create tracking timeline
    const timeline = [
      {
        status: "pending",
        label: "Order Placed",
        completed: true,
        date: order.created_at,
      },
      {
        status: "confirmed",
        label: "Order Confirmed",
        completed: ["confirmed", "processing", "shipped", "delivered"].includes(order.status),
        date: order.status === "confirmed" ? order.updated_at : null,
      },
      {
        status: "processing",
        label: "Processing",
        completed: ["processing", "shipped", "delivered"].includes(order.status),
        date: order.status === "processing" ? order.updated_at : null,
      },
      {
        status: "shipped",
        label: "Shipped",
        completed: ["shipped", "delivered"].includes(order.status),
        date: order.status === "shipped" ? order.updated_at : null,
      },
      {
        status: "delivered",
        label: "Delivered",
        completed: order.status === "delivered",
        date: order.status === "delivered" ? order.updated_at : null,
      },
    ]

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          order: {
            order_number: order.order_number,
            status: order.status,
            payment_status: order.payment_status,
            tracking_number: order.tracking_number,
            estimated_delivery: order.estimated_delivery,
            items: order.items,
          },
          timeline,
        },
        "Order tracking info fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching order tracking info"))
  }
}

export { createOrder, getUserOrders, getOrderDetails, cancelOrder, trackOrder }
