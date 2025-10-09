import { request } from "express"
import { StoreCategoryModel as StoreCategory, StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import mongoose, { model } from "mongoose"
import { Product } from "../../Models/productModel.js"
import { Store } from "../../Models/storeModel.js"
import { populate } from "dotenv"

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
      // parent_id: null,
    }).populate("products");


    if (!parentCategories.length) {
      return reply.code(404).send(new ApiResponse(404, {}, "No categories found"));
    }

    const categoriesWithCounts = await Promise.all(
      parentCategories.map(async (parent) => {
        // Fetch subcategories
        const subcategories = await StoreCategoryModel.find({
          store_id: store_id,
          category_id: parent._id,
        }).populate("products");

        // Count products in parent category
        const parentProductCount = parent.products.length

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


const populateProducts = {
  path: "products",
  model: "Product",
  populate: {
    path: "variants",
    model: "ProductVariant",
    populate: {
      path: "sizes",
      model: "ProductSizes",
    },
  },
};


const getCategoryProducts = async (request, reply) => {
  try {
    const { slug, store_id } = request.params;

    // 1. Validate Input
    if (!slug || !store_id) {
      return reply.code(400).send(
        new ApiResponse(400, {}, "Both 'slug' and 'store_id' are required parameters.")
      );
    }

    // 2. Find the parent category first.
    const parentCategory = await StoreCategoryModel.findOne({ slug, store_id });
    if (!parentCategory) {
      return reply.code(404).send(
        new ApiResponse(404, {}, "Category not found.")
      );
    }

    // 3. Find all direct subcategories of the parent.
    const subCategories = await StoreCategoryModel.find({ category_id: parentCategory._id });

    // 4. Create a single list of all category IDs (parent + subcategories).
    const allCategoryIds = [parentCategory._id, ...subCategories.map(sc => sc._id)];

    // 5. Fetch all these categories in ONE database call and populate their products.
    // This is much more efficient than populating the parent and subs separately.
    const allRelatedCategories = await StoreCategoryModel.find({ _id: { $in: allCategoryIds } })
      .populate(populateProducts);

    // 6. Process the results to build the final response.
    const productMap = new Map(); // Use a Map for efficient de-duplication by ID.
    const subCategoryNames = [];

    for (const category of allRelatedCategories) {
      // If it's a subcategory, add its name to our list.
      if (category.category_id && category.category_id.toString() === parentCategory._id.toString()) {
        subCategoryNames.push({ name: category.display_name, id: category._id });
      }
      // Add all products from this category to the map to ensure uniqueness.
      if (category.products) {
        for (const product of category.products) {
          productMap.set(product._id.toString(), product);
        }
      }
    }

    const uniqueProducts = Array.from(productMap.values());
    parentCategory.products = uniqueProducts;
    parentCategory.subCategories = subCategoryNames // Attach unique products to parent category
    // 7. Construct a clean, final response object.
    const result = {
      category: parentCategory.toJSON(), // Use toJSON() to get a plain object
      subcategories: subCategoryNames,
      // products: uniqueProducts,
    };

    reply.status(200).send(
      new ApiResponse(200, result, "Category and products fetched successfully")
    );

  } catch (err) {
    console.error("Error fetching category products:", err);
    reply.status(500).send(
      new ApiResponse(500, {}, "An internal server error occurred.")
    );
  }
};



export { getStoreCategory, getCategorySubcategories, getCategoryAttributes, getCategoryProducts }
