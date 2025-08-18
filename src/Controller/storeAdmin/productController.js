// 1. Add Product to Store
import { ApiResponse } from "../../utils/ApiResponse.js"
import { Product, ProductVariant } from "../../Models/productModel.js"
import { Store } from "../../Models/storeModel.js"
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { deleteFromCloudinary } from "../../utils/upload.js";
import { response } from "express";
const addProduct = async (request, reply) => {
    try {
        const storeId = request.user.store_id


        const { name, description, price, category, attributes, stock, tags, storeCategory, parent_category, images, variants, slug, GST, HSNCode, brand, sku } = request.body

        if (!name?.trim() || !price) {
            return reply.code(400).send(new ApiResponse(400, {}, "Name, price are required"))
        }
        // Verify the store exists and user has access
        const store = await Store.findById(storeId)
        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        const product = await Product.create({
            name,
            description,
            price: Number(price),
            category,
            parent_category,
            store_id: storeId,
            attributes: attributes,
            stock: stock,
            images,
            tags: tags,
            variants,
            slug,
            GST,
            HSNCode,
            sku,
            brand
        })

        return reply.code(201).send(new ApiResponse(201, product, "Product added successfully"))
    } catch (error) {
        request.log?.error?.(error)

        console.log(error);

        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while adding the product"))
    }
}

const getStoreProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const {
            category,
            tags,
            minPrice,
            maxPrice,
            page = 1,
            limit = 20,
            sortBy = "created_at",
            sortOrder = "desc",
        } = request.query

        const skip = (page - 1) * limit
        const filter = { store_id: storeId }

        // Apply filters
        if (category) filter.category = category
        if (tags) {
            const tagArray = tags.split(",")
            filter["tags.tagName"] = { $in: tagArray }
        }
        if (minPrice || maxPrice) {
            filter.price = {}
            if (minPrice) filter.price.$gte = Number(minPrice)
            if (maxPrice) filter.price.$lte = Number(maxPrice)
        }

        // Build sort object
        const sort = {}
        sort[sortBy] = sortOrder === "desc" ? -1 : 1

        const [products, total] = await Promise.all([
            Product.find(filter).populate("category", "name").sort(sort).skip(skip).limit(Number(limit)),
            Product.countDocuments(filter),
        ])

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    products,
                    pagination: {
                        page: Number(page),
                        limit: Number(limit),
                        total,
                        pages: Math.ceil(total / limit),
                    },
                },
                "Products fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching products"))
    }
}

// 3. Get Product by ID (Store Admin)
const getProductById = async (request, reply) => {
    try {
        const { productId } = request.params
        const storeId = request.user.store_id

        let product = await Product.findOne({ _id: productId }).populate("category", "id")

        if (!product) {
            return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
        }
        product.category = product.category._id

        return reply.code(200).send(new ApiResponse(200, product, "Product fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching the product"))
    }
}

// 4. Update Product
const updateProduct = async (request, reply) => {
    try {
        const { productId } = request.params;
        const storeId = request.user.store_id;
        const updateData = { ...request.body, updated_at: new Date() };
        console.log(updateData);

        // Parse JSON fields if they are strings
        if (updateData.attributes && typeof updateData.attributes === "string") {
            updateData.attributes = JSON.parse(updateData.attributes);
        }
        if (updateData.stock && typeof updateData.stock === "string") {
            updateData.stock = JSON.parse(updateData.stock);
        }
        if (updateData.tags && typeof updateData.tags === "string") {
            updateData.tags = JSON.parse(updateData.tags);
        }

        // Fetch existing product
        const existingProduct = await Product.findOne({ _id: productId, store_id: storeId });
        if (!existingProduct) {
            return reply.code(404).send(new ApiResponse(404, {}, "Product not found"));
        }

        // Handle new uploaded images (only keep public URLs)
        if (updateData.image && Array.isArray(updateData.image) && updateData.image.length > 0) {
            const newImageUrls = updateData.image
                .map((file) => file?.path || file?.secure_url)
                .filter((url) => typeof url === "string" && url.trim().length > 0);

            updateData.images = [...(existingProduct.images || []), ...newImageUrls];
        }

        // Final safeguard: ensure images is an array of strings
        if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = updateData.images.filter((url) => typeof url === "string" && url.trim());
        }

        const updated = await Product.findOneAndUpdate(
            { _id: productId, store_id: storeId },
            updateData,
            { new: true }
        ).populate("category", "name");

        return reply.code(200).send(new ApiResponse(200, updated, "Product updated successfully"));
    } catch (error) {
        request.log?.error?.(error);

        // Cleanup: delete newly uploaded images if update fails
        const { image } = request.body;
        if (image && Array.isArray(image)) {
            for (const file of image) {
                if (file.public_id) {
                    try {
                        await deleteFromCloudinary(file.public_id);
                    } catch (cleanupError) {
                        console.error("Error cleaning up uploaded file:", cleanupError);
                    }
                }
            }
        }

        return reply.code(500).send(new ApiResponse(500, { error }, "Something went wrong while updating the product"));
    }
};

// 5. Delete Product
const deleteProduct = async (request, reply) => {
    try {
        const { productId } = request.params
        const storeId = request.user.store_id

        const deleted = await Product.findOneAndDelete({ _id: productId, store_id: storeId })

        if (!deleted) {
            return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
        }

        return reply.code(200).send(new ApiResponse(200, {}, "Product deleted successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while deleting the product"))
    }
}

// 6. Bulk Update Products
const bulkUpdateProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { productIds, updateData } = request.body

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return reply.code(400).send(new ApiResponse(400, {}, "Product IDs array is required"))
        }

        const result = await Product.updateMany(
            { _id: { $in: productIds }, store_id: storeId },
            { ...updateData, updated_at: new Date() },
        )

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                },
                "Products updated successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating products"))
    }
}

// 7. Get Low Stock Products
const getLowStockProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { threshold = 5 } = request.query

        const lowStockProducts = await Product.find({
            store_id: storeId,
            "stock.quantity": { $lte: Number(threshold), $gt: 0 },
        }).populate("category", "name")

        return reply.code(200).send(new ApiResponse(200, lowStockProducts, "Low stock products fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching low stock products"))
    }
}

// 8. Get Out of Stock Products
const getOutOfStockProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const outOfStockProducts = await Product.find({
            store_id: storeId,
            "stock.quantity": { $lte: 0 },
        }).populate("category", "name")

        return reply.code(200).send(new ApiResponse(200, outOfStockProducts, "Out of stock products fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching out of stock products"))
    }
}

// add product to category
const addProductToCategory = async (request, reply) => {
    try {
        const { product_id, category_id } = request.body
        const store_id = request.user.store_id

        if (!product_id || !category_id || !store_id) {
            return reply.code(400).send(new ApiResponse(400, {}, "Missing product_id or category_id"))
        }

        const storeCategory = await StoreCategoryModel.findById(category_id)

        if (!storeCategory) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store category not found"))
        }

        const productExists = storeCategory.products.includes(product_id)

        if (productExists) {
            return reply.code(409).send(new ApiResponse(409, {}, "Product already exists in this category"))
        }

        storeCategory.products.push(product_id)
        await storeCategory.save()

        return reply.code(200).send(new ApiResponse(200, storeCategory, "Product added to category successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while adding product to category"))
    }
}

const toggleProductStatus = async (request, reply) => {
    try {
        const { product_id } = request.params;
        const { status } = request.body;
        // console.log("req body", request.body);

        const store_id = request.user.store_id;

        // Fetch the current category
        const product = await Product.findOne({ _id: product_id, store_id });

        if (!product) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store category not found"));
        }

        // Toggle is_active value
        product.is_active = status;
        await product.save();

        return reply
            .code(200)
            .send(new ApiResponse(200, product, "Store category status toggled successfully"));
    } catch (error) {
        request.log?.error?.(error);
        return reply.code(500).send(new ApiResponse(500, { msg: error.toString() }, "Error toggling store category status"));
    }
}

export {
    getOutOfStockProducts,
    getStoreProducts,
    getProductById,
    getLowStockProducts,
    updateProduct,
    deleteProduct,
    addProduct,
    bulkUpdateProducts,
    addProductToCategory,
    toggleProductStatus,
}
