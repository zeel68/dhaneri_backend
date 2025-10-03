import { ApiResponse } from "../../utils/ApiResponse.js";
import { Category } from "../../Models/categoryModel.js";
import { Store } from "../../Models/storeModel.js";
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js";
// Helper function to generate slug
const generateSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// Get all global categories with advanced filtering and pagination
const getGlobalCategories = async (request, reply) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            is_active,
            sort_by = 'created_at',
            sort_order = 'desc'
        } = request.query;

        // Build filter object
        const filter = {};

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } }
            ];
        }

        if (is_active !== undefined) {
            filter.is_active = is_active === 'true';
        }

        // Parse pagination parameters
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Sort configuration
        const sort = {};
        sort[sort_by] = sort_order === 'desc' ? -1 : 1;

        // Execute query with pagination
        const [categories, totalCount] = await Promise.all([
            Category.find(filter)
                // .populate('tag_schema', 'name type')
                .sort(sort)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Category.countDocuments(filter)
        ]);

        if (!categories.length) {
            return reply.code(404).send(new ApiResponse(404, {}, "No categories found"));
        }

        // Get store counts for all categories
        const categoryIds = categories.map(cat => cat._id);
        const storeCounts = await Store.aggregate([
            {
                $match: { category_id: { $in: categoryIds } }
            },
            {
                $group: {
                    _id: "$category_id",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create store count map
        const countMap = storeCounts.reduce((acc, curr) => {
            acc[curr._id.toString()] = curr.count;
            return acc;
        }, {});

        // Enrich categories with store count and pagination info
        const enrichedCategories = categories.map(cat => ({
            ...cat,
            store_count: countMap[cat._id.toString()] || 0
        }));

        const totalPages = Math.ceil(totalCount / limitNum);
        const paginationInfo = {
            current_page: pageNum,
            total_pages: totalPages,
            total_items: totalCount,
            items_per_page: limitNum,
            has_next: pageNum < totalPages,
            has_prev: pageNum > 1
        };

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    categories: enrichedCategories,
                    pagination: paginationInfo
                },
                "Categories fetched successfully"
            )
        );
    } catch (error) {
        console.error("Error fetching categories:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    }
};

// Get single category by ID
const getGlobalCategoryById = async (request, reply) => {
    try {
        const { categoryId } = request.params;

        if (!isValidObjectId(categoryId)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Invalid category ID"));
        }

        const category = await Category.findById(categoryId)
            .populate('tag_schema', 'name type description')
            .lean();

        if (!category) {
            return reply.code(404).send(new ApiResponse(404, {}, "Category not found"));
        }

        // Get store count for this category
        const storeCount = await Store.countDocuments({ category_id: categoryId });

        const enrichedCategory = {
            ...category,
            store_count: storeCount
        };

        return reply.code(200).send(
            new ApiResponse(200, enrichedCategory, "Category fetched successfully")
        );
    } catch (error) {
        console.error("Error fetching category:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    }
};

// Add new global category
const addGlobalCategory = async (request, reply) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const {
            name,
            image_url,
            config = {},
            tag_schema = [],
            is_active = true
        } = request.body;

        // Validation
        if (!name?.trim()) {
            return reply.code(400).send(new ApiResponse(400, {}, "Category name is required"));
        }

        if (name.trim().length < 2 || name.trim().length > 100) {
            return reply.code(400).send(
                new ApiResponse(400, {}, "Category name must be between 2 and 100 characters")
            );
        }

        // Check for duplicate category name
        const existingCategory = await Category.findOne({
            name: name.trim()
        }).session(session);

        if (existingCategory) {
            await session.abortTransaction();
            return reply.code(409).send(new ApiResponse(409, {}, "Category name already exists"));
        }

        // Validate tag IDs if provided
        if (tag_schema.length > 0) {
            const validTags = await Tag.find({
                _id: { $in: tag_schema }
            }).session(session);

            if (validTags.length !== tag_schema.length) {
                await session.abortTransaction();
                return reply.code(400).send(new ApiResponse(400, {}, "One or more tag IDs are invalid"));
            }
        }

        // Generate slug from name
        const slug = generateSlug(name);

        // Create category
        const category = await Category.create([{
            name: name.trim(),
            slug,
            image_url: image_url || "",
            config,
            tag_schema,
            is_active
        }], { session });

        await session.commitTransaction();

        const createdCategory = await Category.findById(category[0]._id)
            .populate('tag_schema', 'name type')
            .lean();

        return reply.code(201).send(
            new ApiResponse(201, createdCategory, "Category created successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        console.error("Error creating category:", error);

        if (error.name === 'ValidationError') {
            return reply.code(400).send(
                new ApiResponse(400, {}, error.message)
            );
        }

        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    } finally {
        session.endSession();
    }
};

// Update global category
const updateGlobalCategory = async (request, reply) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { categoryId } = request.params;
        const {
            name,
            image_url,
            config,
            tag_schema,
            is_active
        } = request.body;

        if (!isValidObjectId(categoryId)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Invalid category ID"));
        }

        // Check if category exists
        const existingCategory = await Category.findById(categoryId).session(session);
        if (!existingCategory) {
            await session.abortTransaction();
            return reply.code(404).send(new ApiResponse(404, {}, "Category not found"));
        }

        // Validate name if provided
        if (name !== undefined) {
            if (!name.trim()) {
                await session.abortTransaction();
                return reply.code(400).send(new ApiResponse(400, {}, "Category name cannot be empty"));
            }

            if (name.trim().length < 2 || name.trim().length > 100) {
                await session.abortTransaction();
                return reply.code(400).send(
                    new ApiResponse(400, {}, "Category name must be between 2 and 100 characters")
                );
            }

            // Check for duplicate name (excluding current category)
            const duplicateCategory = await Category.findOne({
                name: name.trim(),
                _id: { $ne: categoryId }
            }).session(session);

            if (duplicateCategory) {
                await session.abortTransaction();
                return reply.code(409).send(new ApiResponse(409, {}, "Category name already exists"));
            }

            existingCategory.name = name.trim();
            existingCategory.slug = generateSlug(name);
        }

        // Update other fields if provided
        if (image_url !== undefined) existingCategory.image_url = image_url;
        if (config !== undefined) existingCategory.config = config;
        if (is_active !== undefined) existingCategory.is_active = is_active;

        // Validate and update tags if provided
        if (tag_schema !== undefined) {
            if (tag_schema.length > 0) {
                const validTags = await Tag.find({
                    _id: { $in: tag_schema }
                }).session(session);

                if (validTags.length !== tag_schema.length) {
                    await session.abortTransaction();
                    return reply.code(400).send(new ApiResponse(400, {}, "One or more tag IDs are invalid"));
                }
            }
            existingCategory.tag_schema = tag_schema;
        }

        await existingCategory.save({ session });
        await session.commitTransaction();

        const updatedCategory = await Category.findById(categoryId)
            .populate('tag_schema', 'name type')
            .lean();

        return reply.code(200).send(
            new ApiResponse(200, updatedCategory, "Category updated successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        console.error("Error updating category:", error);

        if (error.name === 'ValidationError') {
            return reply.code(400).send(new ApiResponse(400, {}, error.message));
        }

        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    } finally {
        session.endSession();
    }
};

// Delete global category
const deleteGlobalCategory = async (request, reply) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { categoryId } = request.params;

        if (!isValidObjectId(categoryId)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Invalid category ID"));
        }

        const category = await Category.findById(categoryId).session(session);
        if (!category) {
            await session.abortTransaction();
            return reply.code(404).send(new ApiResponse(404, {}, "Category not found"));
        }

        // Check if category is used by any stores
        const storeCount = await Store.countDocuments({
            category_id: categoryId
        }).session(session);

        if (storeCount > 0) {
            await session.abortTransaction();
            return reply.code(409).send(
                new ApiResponse(409, { store_count: storeCount },
                    "Cannot delete category: It is being used by stores")
            );
        }

        // Delete the category
        await Category.deleteOne({ _id: categoryId }).session(session);
        await session.commitTransaction();

        return reply.code(200).send(
            new ApiResponse(200, {}, "Category deleted successfully")
        );
    } catch (error) {
        await session.abortTransaction();
        console.error("Error deleting category:", error);

        if (error.message.includes('Cannot delete category used by stores')) {
            return reply.code(409).send(new ApiResponse(409, {}, error.message));
        }

        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    } finally {
        session.endSession();
    }
};

// Toggle category status
const toggleGlobalCategoryStatus = async (request, reply) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { categoryId } = request.params;

        if (!isValidObjectId(categoryId)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Invalid category ID"));
        }

        const category = await Category.findById(categoryId).session(session);
        if (!category) {
            await session.abortTransaction();
            return reply.code(404).send(new ApiResponse(404, {}, "Category not found"));
        }

        // Toggle the status
        category.is_active = !category.is_active;
        await category.save({ session });
        await session.commitTransaction();

        return reply.code(200).send(
            new ApiResponse(200,
                {
                    id: categoryId,
                    is_active: category.is_active
                },
                `Category ${category.is_active ? 'activated' : 'deactivated'} successfully`
            )
        );
    } catch (error) {
        await session.abortTransaction();
        console.error("Error toggling category status:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    } finally {
        session.endSession();
    }
};

// Get categories with minimal data (for dropdowns)
const getCategoryOptions = async (request, reply) => {
    try {
        const { is_active = true } = request.query;

        const filter = {};
        if (is_active !== undefined) {
            filter.is_active = is_active === 'true';
        }

        const categories = await Category.find(filter)
            .select('name slug _id is_active')
            .sort({ name: 1 })
            .lean();

        return reply.code(200).send(
            new ApiResponse(200, categories, "Category options fetched successfully")
        );
    } catch (error) {
        console.error("Error fetching category options:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    }
};

// Bulk update category status
const bulkUpdateCategoryStatus = async (request, reply) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { category_ids, is_active } = request.body;

        if (!Array.isArray(category_ids) || category_ids.length === 0) {
            return reply.code(400).send(new ApiResponse(400, {}, "category_ids array is required"));
        }

        if (typeof is_active !== 'boolean') {
            return reply.code(400).send(new ApiResponse(400, {}, "is_active boolean is required"));
        }

        // Validate all category IDs
        const validCategories = await Category.find({
            _id: { $in: category_ids }
        }).session(session);

        if (validCategories.length !== category_ids.length) {
            await session.abortTransaction();
            return reply.code(400).send(new ApiResponse(400, {}, "One or more category IDs are invalid"));
        }

        // Update all categories
        await Category.updateMany(
            { _id: { $in: category_ids } },
            { $set: { is_active } }
        ).session(session);

        await session.commitTransaction();

        return reply.code(200).send(
            new ApiResponse(200,
                {
                    updated_count: category_ids.length,
                    is_active
                },
                `Bulk update completed: ${category_ids.length} categories ${is_active ? 'activated' : 'deactivated'}`
            )
        );
    } catch (error) {
        await session.abortTransaction();
        console.error("Error in bulk update:", error);
        return reply.code(500).send(new ApiResponse(500, {}, "Internal server error"));
    } finally {
        session.endSession();
    }
};

export {
    getGlobalCategories,
    getGlobalCategoryById,
    addGlobalCategory,
    updateGlobalCategory,
    deleteGlobalCategory,
    toggleGlobalCategoryStatus,
    getCategoryOptions,
    bulkUpdateCategoryStatus
};