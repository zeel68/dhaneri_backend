import { ApiResponse } from "../../utils/ApiResponse.js";
import { Category } from "../../Models/categoryModel.js";
import { Store } from "../../Models/storeModel.js";
import { Product, StoreCategory } from "../../Models/productModel.js";
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js";
import { ApiError } from "../../utils/ApiError.js";
import mongoose from "mongoose";

// GET: Fetch category assigned to the authenticated user's store
const getStoreCategory = async (request, reply) => {
    try {
        const store_id = request.body || request.user.store_id;

        const store = await Store.findById(store_id)
            .populate("category_id", "name image_url tag_schema")
            .select("category_id");

        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"));
        }
        console.log(store);

        return reply.code(200).send(new ApiResponse(200, store.category_id, "Store category fetched successfully 1"));
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store category"));
    }
};

// POST: Add a new category for the store
const addStoreCategory = async (req, res) => {
    try {
        const {
            category_id,
            img_url = "",
            is_primary = false,
            category_name,
            description,
            sort_order = 0,
            is_active = true,
            config = {}
        } = req.body;

        const store_id = req.user.store_id;
        // Validate required fields
        if (!store_id || !category_name) {
            return res.status(400).send({ message: "category_id, store_id, and display_name are required." });
        }

        // Optional: Ensure only one primary category per store
        if (is_primary) {
            const existingPrimary = await StoreCategoryModel.findOne({ store_id, is_primary: true });
            if (existingPrimary) {
                return res.status(400).send({ message: "A primary category already exists for this store." });
            }
        }

        // // Create the new store category
        const newStoreCategory = new StoreCategoryModel({
            category_id,
            store_id,
            is_primary,
            img_url,
            display_name:category_name,
            description,
            sort_order,
            is_active,
            config
        });

        await newStoreCategory.save();

        return res.status(201).send({ message: "Store category added successfully.", data: newStoreCategory });
    } catch (error) {
        console.error(error
        );
        if (error.code === 11000) {
            // Handle unique index conflict (store_id + category_id)
            return res.status(409).send({ message: "This category is already added to the store." });
        }
        console.error("Error adding store category:", error);
        return res.status(500).send({ message: "Internal server error." });
    }
};


const getStoreCategories = async (request, reply) => {
    const store_id = request.user?.store_id || request.body?.store_id || request.query?.store_id;

    console.log(request.params);
    if (!store_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Store ID is required"));
    }

    try {
        const categories = await StoreCategoryModel.find({ store_id });

        if (!categories || categories.length === 0) {
            return reply.code(404).send(new ApiResponse(404, {}, "Categories not found"));
        }

        return reply.code(200).send(new ApiResponse(200, categories, "Store categories fetched successfully"));
    } catch (error) {
        console.error("Error fetching store categories:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store categories"));
    }
};


const getAvailableTags = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId).populate("category_id", "tag_schema name").select("category_id")

        if (!store) {
            throw new ApiError(404, "Store not found")
        }

        if (!store.category_id) {
            throw new ApiError(404, "Store category not found")
        }

        const availableTags = store.category_id?.tag_schema || []

        // Also get tags that are actually being used in products
        const usedTags = await Product.aggregate([
            { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
            { $unwind: "$tags" },
            {
                $group: {
                    _id: {
                        tagName: "$tags.tagName",
                        tagType: "$tags.tagType",
                    },
                    count: { $sum: 1 },
                    values: { $addToSet: "$tags.value" },
                },
            },
            {
                $project: {
                    tagName: "$_id.tagName",
                    tagType: "$_id.tagType",
                    productCount: "$count",
                    values: "$values",
                    _id: 0,
                },
            },
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    availableTags,
                    usedTags,
                    categoryName: store.category_id.name,
                },
                "Available tags fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching available tags"))
    }
}

// 3. Get Products by Tag Filter
const getProductsByTags = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { tags, page = 1, limit = 20, sortBy = "created_at", sortOrder = "desc" } = request.query

        if (!tags) {
            throw new ApiError(400, "Tags parameter is required")
        }

        const skip = (page - 1) * limit
        const tagArray = tags.split(",")

        const filter = { store_id: new mongoose.Types.ObjectId(storeId) }

        // Filter by tags
        if (tagArray.length > 0) {
            filter["tags.tagName"] = { $in: tagArray }
        }

        // Build sort object
        const sort = {}
        sort[sortBy] = sortOrder === "desc" ? -1 : 1

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("parent_category", "name")
                .populate("category", "name")
                .sort(sort)
                .skip(skip)
                .limit(Number(limit)),
            Product.countDocuments(filter),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    products,
                    filters: {
                        tags: tagArray,
                    },
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total,
                        pages: Math.ceil(total / limit),
                    },
                },
                "Products filtered by tags fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching products by tags"))
    }
}

// 4. Get Tag Usage Statistics
const getTagUsageStats = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const tagStats = await Product.aggregate([
            { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
            { $unwind: "$tags" },
            {
                $group: {
                    _id: {
                        tagName: "$tags.tagName",
                        tagType: "$tags.tagType",
                    },
                    count: { $sum: 1 },
                    values: { $addToSet: "$tags.value" },
                },
            },
            {
                $project: {
                    tagName: "$_id.tagName",
                    tagType: "$_id.tagType",
                    productCount: "$count",
                    uniqueValues: { $size: "$values" },
                    values: "$values",
                    _id: 0,
                },
            },
            { $sort: { productCount: -1 } },
        ])

        // Get total products for percentage calculation
        const totalProducts = await Product.countDocuments({ store_id: storeId })

        const enrichedStats = tagStats.map((stat) => ({
            ...stat,
            usagePercentage: totalProducts > 0 ? ((stat.productCount / totalProducts) * 100).toFixed(2) : 0,
        }))

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    tagStats: enrichedStats,
                    totalProducts,
                    totalTags: tagStats.length,
                },
                "Tag usage statistics fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching tag usage statistics"))
    }
}

// 5. Get Products with Specific Tag Values
const getProductsByTagValues = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { tagName, tagValues, page = 1, limit = 20, sortBy = "created_at", sortOrder = "desc" } = request.query

        if (!tagName || !tagValues) {
            throw new ApiError(400, "Tag name and values are required")
        }

        const skip = (page - 1) * limit
        const valueArray = tagValues.split(",")

        const filter = {
            store_id: new mongoose.Types.ObjectId(storeId),
            tags: {
                $elemMatch: {
                    tagName: tagName,
                    value: { $in: valueArray },
                },
            },
        }

        // Build sort object
        const sort = {}
        sort[sortBy] = sortOrder === "desc" ? -1 : 1

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("parent_category", "name")
                .populate("category", "name")
                .sort(sort)
                .skip(skip)
                .limit(Number(limit)),
            Product.countDocuments(filter),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    products,
                    filters: {
                        tagName,
                        tagValues: valueArray,
                    },
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total,
                        pages: Math.ceil(total / limit),
                    },
                },
                "Products with specific tag values fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching products by tag values"))
    }
}

// 6. Get All Unique Tag Values for a Tag Name
const getTagValues = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { tagName } = request.params

        if (!tagName) {
            throw new ApiError(400, "Tag name is required")
        }

        const tagValues = await Product.aggregate([
            { $match: { store_id: new mongoose.Types.ObjectId(storeId) } },
            { $unwind: "$tags" },
            { $match: { "tags.tagName": tagName } },
            {
                $group: {
                    _id: "$tags.value",
                    count: { $sum: 1 },
                    tagType: { $first: "$tags.tagType" },
                },
            },
            {
                $project: {
                    value: "$_id",
                    productCount: "$count",
                    tagType: "$tagType",
                    _id: 0,
                },
            },
            { $sort: { productCount: -1 } },
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    tagName,
                    values: tagValues,
                    totalValues: tagValues.length,
                },
                "Tag values fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching tag values"))
    }
}
// 7. get product by category
const getProductsByCategoryValues = async (request, reply) => {

}

const updateStoreCategory = async (request, reply) => {
    try {
        const { category_id } = request.params;
        const store_id = request.user.store_id;
        const updateData = request.body;

        const category = await StoreCategoryModel.findOneAndUpdate(
            { _id: category_id, store_id },
            updateData,
            { new: true }
        );

        if (!category) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store category not found"));
        }

        return reply.code(200).send(new ApiResponse(200, category, "Store category updated successfully"));
    } catch (error) {
        request.log?.error?.(error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating store category"));
    }
};

const deleteStoreCategory = async (request, reply) => {
    try {
        const { category_id } = request.params;
        const store_id = request.user.store_id;

        const deletedCategory = await StoreCategoryModel.findOneAndDelete({
            _id: category_id,
            store_id
        });

        if (!deletedCategory) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store category not found"));
        }

        return reply.code(200).send(new ApiResponse(200, deletedCategory, "Store category deleted successfully"));
    } catch (error) {
        request.log?.error?.(error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error deleting store category"));
    }
};


export {
    getStoreCategory,
    addStoreCategory,
    getStoreCategories,
    getAvailableTags,
    getProductsByTagValues,
    getTagUsageStats,
    getTagValues,
    getProductsByCategoryValues,
    getProductsByTags,
    updateStoreCategory,
    deleteStoreCategory
}
