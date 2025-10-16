import { Order } from "../../Models/orderModel.js"
import { Payment } from "../../Models/paymentModel.js"
import { Store } from "../../Models/storeModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"
import { Product } from "../../Models/productModel.js" // Import Product model

// Get available payment methods for store
const getPaymentMethods = async (request, reply) => {
  try {
    const { store_id } = request.params

    const store = await Store.findById(store_id).select("payment_methods")

    if (!store) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    // Default payment methods if not configured
    const defaultMethods = [
      {
        id: "card",
        name: "Credit/Debit Card",
        description: "Pay with your credit or debit card",
        enabled: true,
        icon: "credit-card",
      },
      {
        id: "paypal",
        name: "PayPal",
        description: "Pay with your PayPal account",
        enabled: false,
        icon: "paypal",
      },
      {
        id: "stripe",
        name: "Stripe",
        description: "Secure payment with Stripe",
        enabled: false,
        icon: "stripe",
      },
      {
        id: "cod",
        name: "Cash on Delivery",
        description: "Pay when you receive your order",
        enabled: true,
        icon: "banknote",
      },
    ]

    const paymentMethods = store.payment_methods || defaultMethods

    return reply
      .code(200)
      .send(new ApiResponse(200, { payment_methods: paymentMethods }, "Payment methods fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching payment methods"))
  }
}

// Initialize payment for an order
const initializePayment = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { order_id, payment_method, return_url, payment_provider } = request.body
    const user_id = request.user._id

    if (!order_id || !payment_method) {
      return reply.code(400).send(new ApiResponse(400, {}, "Order ID and payment method are required"))
    }

    // Get order
    const order = await Order.findOne({
      _id: order_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      user_id: new mongoose.Types.ObjectId(user_id),
      payment_status: "pending",
    })

    if (!order) {
      return reply.code(404).send(new ApiResponse(404, {}, "Order not found or already paid"))
    }

    // Create payment record
    const payment = await Payment.create({
      order_id: order_id,
      store_id: store_id,
      user_id: user_id,
      amount: order.total,
      currency: "INR",
      payment_provider,
      payment_method,
      status: "pending",
      gateway_data: {},
    })

    const paymentResponse = {
      payment_id: payment._id,
      amount: order.total,
      currency: "INR",
      payment_provider,
      payment_method,
      status: "pending",
      order_number: order.order_number,
      coupon_id: order.coupon_id,
      cart_id: order.cart_id,
    }

    // Payment gateway integration stubs
    switch (payment_provider) {
      case "card":
      case "stripe":
        paymentResponse.client_secret = `pi_${payment._id}_secret_${Date.now()}`
        paymentResponse.publishable_key = "pk_test_example"
        break
      case "razorpay":
        paymentResponse.razorpay_key = "rzp_test_example"
        paymentResponse.razorpay_order_id = `order_${payment._id}`
        break
      case "paypal":
        paymentResponse.approval_url = `https://www.paypal.com/checkoutnow?token=EC-${payment._id}`
        break
      case "cod":
        payment.status = "pending"
        await payment.save()
        order.payment_status = "pending"
        order.status = "confirmed"
        await order.save()
        paymentResponse.status = "confirmed"
        paymentResponse.message = "Order confirmed. Payment will be collected on delivery."
        break
      default:
        return reply.code(400).send(new ApiResponse(400, {}, "Unsupported payment method"))
    }

    if (return_url) {
      paymentResponse.return_url = return_url
    }

    return reply.code(200).send(new ApiResponse(200, paymentResponse, "Payment initialized successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error initializing payment"))
  }
}

// Process payment callback (webhook)
const processPaymentCallback = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { payment_id, status, transaction_id, gateway_response, razorpay_payment_id } = request.body

    if (!payment_id || !status) {
      return reply.code(400).send(new ApiResponse(400, {}, "Payment ID and status are required"))
    }

    const payment = await Payment.findOne({
      _id: payment_id,
      store_id: store_id,
    })

    if (!payment) {
      return reply.code(404).send(new ApiResponse(404, {}, "Payment not found"))
    }

    // Update payment status and gateway details
    payment.status = status
    payment.transaction_id = transaction_id || razorpay_payment_id || ""
    payment.gateway_response = gateway_response || {}
    payment.processed_at = new Date()
    await payment.save()

    // Update order status based on payment status
    const order = await Order.findById(payment.order_id)
    if (order) {
      if (status === "completed" || status === "success") {
        order.payment_status = "paid"
        order.status = "confirmed"
      } else if (status === "failed") {
        order.payment_status = "failed"
        // Restore stock if payment failed
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { "stock.quantity": item.quantity },
          })
        }
      }
      await order.save()
    }

    return reply.code(200).send(new ApiResponse(200, { payment, order }, "Payment callback processed successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error processing payment callback"))
  }
}

// Get payment status
const getPaymentStatus = async (request, reply) => {
  try {
    const { store_id, payment_id } = request.params

    const payment = await Payment.findOne({
      _id: payment_id,
      store_id: new mongoose.Types.ObjectId(store_id),
    })
      .populate("order_id", "order_number status total")
      .select("-gateway_response -__v")

    if (!payment) {
      return reply.code(404).send(new ApiResponse(404, {}, "Payment not found"))
    }

    return reply.code(200).send(new ApiResponse(200, { payment }, "Payment status fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching payment status"))
  }
}

export { getPaymentMethods, initializePayment, processPaymentCallback, getPaymentStatus }
