import { StoreCategoryModel as StoreCategory, StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"

// Get store categories for storefront
const getStoreCategory = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { level = 0, parent_id } = request.query

    const filter = {
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    }

    if (parent_id) {
      filter.parent_id = new mongoose.Types.ObjectId(parent_id)
    } else if (level === "0") {
      filter.parent_id = null
    }

    const categories = await StoreCategory.find(filter)
      // .populate("StoreCategory", "name description attributes")
      // .populate("parent_id", "name")
      .sort({ sort_order: 1, name: 1 })
      .select("-__v -store_id -createdAt -updatedAt")

    // Get subcategory counts
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const subcategoryCount = await StoreCategory.countDocuments({
          store_id: new mongoose.Types.ObjectId(store_id),
          parent_id: category._id,
          is_active: true,
        })

        return {
          ...category.toObject(),
          subcategory_count: subcategoryCount,
        }
      }),
    )

    return reply
      .code(200)
      .send(new ApiResponse(200, { categories: categoriesWithCounts }, "Categories fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching categories"))
  }
}

// Get category subcategories
const getCategorySubcategories = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { category_id } = request.query

    if (!category_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Category ID is required"))
    }

    const subcategories = await StoreCategory.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      parent_id: new mongoose.Types.ObjectId(category_id),
      is_active: true,
    })
      .populate("category_id", "name description")
      .sort({ sort_order: 1, name: 1 })
      .select("-__v")

    return reply.code(200).send(new ApiResponse(200, { subcategories }, "Subcategories fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching subcategories"))
  }
}

// Get category attributes
const getCategoryAttributes = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { category_id } = request.query

    if (!category_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Category ID is required"))
    }

    const storeCategory = await StoreCategory.findOne({
      _id: category_id,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
    }).populate("category_id", "attributes")

    if (!storeCategory) {
      return reply.code(404).send(new ApiResponse(404, {}, "Category not found"))
    }

    const attributes = storeCategory.global_category_id?.attributes || []

    return reply.code(200).send(new ApiResponse(200, { attributes }, "Category attributes fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching category attributes"))
  }
}

export { getStoreCategory, getCategorySubcategories, getCategoryAttributes }
