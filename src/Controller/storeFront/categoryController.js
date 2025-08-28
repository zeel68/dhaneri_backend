import { request } from "express"
import { StoreCategoryModel as StoreCategory, StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose from "mongoose"
import { Product } from "../../Models/productModel.js"
import { Store } from "../../Models/storeModel.js"

// Get store categories for storefront
const getStoreCategory = async (request, reply) => {
  const { store_id } = request.params;
  // temp change
  if (!store_id) {
    return reply.code(400).send(new ApiResponse(400, {}, "Store ID is required"));
  }

  try {
    const store = await Store.findById(store_id).select("category_id");

    const parentCategories = await StoreCategoryModel.find({
      store_id: store_id,
      category_id: store.category_id,
      parent_id: null,
    }).populate("products", "name images proce id slug").sort({ sort_order: 1, name: 1 });


    if (!parentCategories.length) {
      return reply.code(404).send(new ApiResponse(404, {}, "No categories found"));
    }

    const categoriesWithCounts = await Promise.all(
      parentCategories.map(async (parent) => {
        // Fetch subcategories
        const subcategories = await StoreCategoryModel.find({
          store_id: store_id,
          category_id: parent._id,
        }).populate("products", "name price images id slug").sort({ sort_order: 1, name: 1 });


        // Count products in parent category
        const parentProductCount = parent.products.length
        console.log("prod", parentProductCount, parent._id);

        // For each subcategory, count products
        const subcategoriesWithCounts = await Promise.all(
          subcategories.map(async (sub) => {
            const subProductCount = sub.products.length

            return {
              ...sub.toObject(),
              product_count: subProductCount,
            };
          })
        );
        // Temp

        return {
          ...parent.toObject(),
          product_count: parentProductCount,
          subcategories: subcategoriesWithCounts,
        };
      })
    );

    return reply.code(200).send(new ApiResponse(200, categoriesWithCounts, "Store categories fetched successfully"));
  } catch (error) {
    console.error("Error fetching store categories:", error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store categories"));
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

const getCategoryProducts = async (request, reply) => {
  try {
    const { slug, store_id } = request.params;

    if (!slug) {
      return reply.code(400).send(new ApiResponse(400, {}, "slug is required"));
    }

    const categories = await StoreCategoryModel.find({ slug, store_id })
      .populate({
        path: "products", // populate the products array
        model: "Product",

      });

    reply.status(200).send(
      new ApiResponse(200, categories, "categories fetched successfully")
    );
  } catch (err) {
    console.error(err);
    reply
      .status(500)
      .send(new ApiResponse(500, {}, "Error fetching category attributes"));
  }
};



export { getStoreCategory, getCategorySubcategories, getCategoryAttributes, getCategoryProducts }
