import { Store } from "../../Models/storeModel.js"
import { User } from "../../Models/userModel.js"
import { Product } from "../../Models/productModel.js"
import { Order } from "../../Models/orderModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get all stores
const getAllStores = async (request, reply) => {
  try {
    const { page = 1, limit = 10, search, status, category, sort = "created_at", order = "desc" } = request.query

    const skip = (page - 1) * limit
    const filter = {}

    // Apply filters
    if (status && status !== "all") {
      filter.is_active = status === "active"
    }
    if (category && category !== "all") {
      filter.category_id = new mongoose.Types.ObjectId(category)
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { domain: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ]
    }

    // Build sort object
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1

    const [stores, total] = await Promise.all([
      Store.find(filter)
        .populate("category_id", "name")
        .populate("owner_id", "name email")
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit)),
      Store.countDocuments(filter),
    ])

    // Get additional statistics for each store
    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const [productCount, orderCount, customerCount] = await Promise.all([
          Product.countDocuments({ store_id: store._id }),
          Order.countDocuments({ store_id: store._id }),
          User.countDocuments({ store_id: store._id, role_name: "customer" }),
        ])

        return {
          ...store.toObject(),
          stats: {
            products: productCount,
            orders: orderCount,
            customers: customerCount,
          },
        }
      }),
    )

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          stores: storesWithStats,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        "Stores fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching stores"))
  }
}

// Get single store details
const getStoreById = async (request, reply) => {
  try {
    const { storeId } = request.params

    const store = await Store.findById(storeId)
      .populate("category_id", "name description")
      .populate("owner_id", "name email phone_number")

    if (!store) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    // Get detailed statistics
    const [productStats, orderStats, customerStats, recentOrders] = await Promise.all([
      Product.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$is_active", 1, 0] } },
            totalValue: { $sum: { $multiply: ["$price", "$stock.quantity"] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalRevenue: { $sum: "$total" },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          },
        },
      ]),
      User.countDocuments({ store_id: storeId }),
      Order.find({ store_id: storeId })
        .populate("user_id", "name email")
        .sort({ created_at: -1 })
        .limit(5)
        .select("order_number total status created_at"),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          store,
          statistics: {
            products: productStats[0] || { total: 0, active: 0, totalValue: 0 },
            orders: orderStats[0] || { total: 0, totalRevenue: 0, pending: 0, completed: 0 },
            customers: customerStats,
            recentOrders,
          },
        },
        "Store details fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store details"))
  }
}

// Update store status
const updateStoreStatus = async (request, reply) => {
  try {
    const { storeId } = request.params
    const { is_active, reason } = request.body

    const updatedStore = await Store.findByIdAndUpdate(
      storeId,
      {
        is_active,
        status_reason: reason,
        updated_at: new Date(),
      },
      { new: true },
    ).populate("category_id", "name")

    if (!updatedStore) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    return reply.code(200).send(new ApiResponse(200, updatedStore, "Store status updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating store status"))
  }
}

// Delete store
const deleteStore = async (request, reply) => {
  try {
    const { storeId } = request.params

    // Check if store has orders
    const orderCount = await Order.countDocuments({ store_id: storeId })
    if (orderCount > 0) {
      return reply
        .code(400)
        .send(new ApiResponse(400, {}, "Cannot delete store with existing orders. Deactivate instead."))
    }

    // Delete related data
    await Promise.all([
      Product.deleteMany({ store_id: storeId }),
      User.deleteMany({ store_id: storeId, role_name: "customer" }),
    ])

    const deletedStore = await Store.findByIdAndDelete(storeId)

    if (!deletedStore) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Store deleted successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error deleting store"))
  }
}



export { getAllStores, getStoreById, updateStoreStatus, deleteStore }
