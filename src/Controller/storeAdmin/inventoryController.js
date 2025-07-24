import { Product } from "../../Models/productModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get inventory overview
const getInventoryOverview = async (request, reply) => {
  try {
    const storeId = request.user.store_id
    const { page = 1, limit = 20, search = "", status = "all", sort = "name", order = "asc" } = request.query

    const filter = { store_id: new mongoose.Types.ObjectId(storeId) }

    // Search filter
    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { sku: { $regex: search, $options: "i" } }]
    }

    // Status filter
    if (status !== "all") {
      switch (status) {
        case "in-stock":
          filter["stock.quantity"] = { $gt: 5 }
          break
        case "low-stock":
          filter["stock.quantity"] = { $lte: 5, $gt: 0 }
          break
        case "out-of-stock":
          filter["stock.quantity"] = { $lte: 0 }
          break
      }
    }

    // Pagination
    const skip = (page - 1) * limit
    const sortObj = {}
    sortObj[sort] = order === "desc" ? -1 : 1

    const [inventory, total] = await Promise.all([
      Product.aggregate([
        { $match: filter },
        {
          $addFields: {
            current_stock: "$stock.quantity",
            reserved_stock: "$stock.reserved",
            available_stock: { $subtract: ["$stock.quantity", "$stock.reserved"] },
            low_stock_threshold: "$stock.low_stock_threshold",
            total_value: { $multiply: ["$stock.quantity", "$cost_price"] },
            status: {
              $switch: {
                branches: [
                  { case: { $lte: ["$stock.quantity", 0] }, then: "out-of-stock" },
                  { case: { $lte: ["$stock.quantity", "$stock.low_stock_threshold"] }, then: "low-stock" },
                ],
                default: "in-stock",
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            sku: 1,
            images: { $arrayElemAt: ["$images", 0] },
            price: 1,
            cost_price: 1,
            current_stock: 1,
            reserved_stock: 1,
            available_stock: 1,
            low_stock_threshold: 1,
            total_value: 1,
            status: 1,
            updated_at: 1,
          },
        },
        { $sort: sortObj },
        { $skip: skip },
        { $limit: Number.parseInt(limit) },
      ]),
      Product.countDocuments(filter),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          inventory,
          pagination: {
            page: Number.parseInt(page),
            limit: Number.parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1,
          },
        },
        "Inventory overview fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching inventory overview"))
  }
}

// Get inventory alerts
const getInventoryAlerts = async (request, reply) => {
  try {
    const storeId = request.user.store_id

    const [lowStockProducts, outOfStockProducts] = await Promise.all([
      Product.find({
        store_id: storeId,
        "stock.quantity": { $lte: 5, $gt: 0 },
      })
        .select("name sku images stock price")
        .sort({ "stock.quantity": 1 }),

      Product.find({
        store_id: storeId,
        "stock.quantity": { $lte: 0 },
      })
        .select("name sku images stock price")
        .sort({ updated_at: -1 }),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          lowStockProducts,
          outOfStockProducts,
          totalAlerts: lowStockProducts.length + outOfStockProducts.length,
        },
        "Inventory alerts fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching inventory alerts"))
  }
}

// Update stock for single product
const updateStock = async (request, reply) => {
  try {
    const { productId } = request.params
    const { type, quantity, reason, notes } = request.body
    const storeId = request.user.store_id

    const validTypes = ["add", "remove", "set"]
    if (!validTypes.includes(type)) {
      return reply.code(400).send(new ApiResponse(400, {}, "Invalid adjustment type"))
    }

    const product = await Product.findOne({ _id: productId, store_id: storeId })
    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
    }

    let newQuantity = product.stock.quantity

    switch (type) {
      case "add":
        newQuantity += quantity
        break
      case "remove":
        newQuantity = Math.max(0, newQuantity - quantity)
        break
      case "set":
        newQuantity = quantity
        break
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        "stock.quantity": newQuantity,
        updated_at: new Date(),
      },
      { new: true },
    )

    // TODO: Log stock adjustment for audit trail

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          product: updatedProduct,
          adjustment: {
            type,
            quantity,
            previousStock: product.stock.quantity,
            newStock: newQuantity,
            reason,
            notes,
          },
        },
        "Stock updated successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating stock"))
  }
}

// Bulk update stock
const bulkUpdateStock = async (request, reply) => {
  try {
    const { adjustments } = request.body
    const storeId = request.user.store_id

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return reply.code(400).send(new ApiResponse(400, {}, "Invalid adjustments data"))
    }

    const results = []
    const errors = []

    for (const adjustment of adjustments) {
      try {
        const { product_id, type, quantity } = adjustment

        const product = await Product.findOne({ _id: product_id, store_id: storeId })
        if (!product) {
          errors.push({ product_id, error: "Product not found" })
          continue
        }

        let newQuantity = product.stock.quantity

        switch (type) {
          case "add":
            newQuantity += quantity
            break
          case "remove":
            newQuantity = Math.max(0, newQuantity - quantity)
            break
          case "set":
            newQuantity = quantity
            break
          default:
            errors.push({ product_id, error: "Invalid adjustment type" })
            continue
        }

        await Product.findByIdAndUpdate(product_id, {
          "stock.quantity": newQuantity,
          updated_at: new Date(),
        })

        results.push({
          product_id,
          previousStock: product.stock.quantity,
          newStock: newQuantity,
          adjustment: { type, quantity },
        })
      } catch (error) {
        errors.push({ product_id: adjustment.product_id, error: error.message })
      }
    }

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          successful: results,
          failed: errors,
          totalProcessed: adjustments.length,
          successCount: results.length,
          errorCount: errors.length,
        },
        "Bulk stock update completed",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error performing bulk stock update"))
  }
}

export { getInventoryOverview, getInventoryAlerts, updateStock, bulkUpdateStock }
