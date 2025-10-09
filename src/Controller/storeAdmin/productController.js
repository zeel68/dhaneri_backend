// 1. Add Product to Store
import { ApiResponse } from "../../utils/ApiResponse.js"
import { Product, ProductSizes, ProductVariant } from "../../Models/productModel.js"
import { Store } from "../../Models/storeModel.js"
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { deleteFromCloudinary } from "../../utils/upload.js";
import { response } from "express";
import { TrendingProduct } from "../../Models/homepageModel.js";
const addProduct = async (request, reply) => {
    try {
        const storeId = request.user.store_id;
        const {
            name,
            description,
            price,
            category,
            attributes,
            stock,
            tags,
            storeCategory,
            parent_category,
            images,
            variants,
            slug
        } = request.body;

        if (!name?.trim()) {
            return reply.code(400).send(new ApiResponse(400, {}, "Name and price are required"));
        }

        // Verify the store exists
        const store = await Store.findById(storeId);
        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"));
        }

        // --- Step 1: Insert Sizes ---
        const allSizeDocs = [];
        const variantSizeMapping = {};

        for (const variant of variants) {
            for (const size of variant.sizes) {
                const { id, ...sizeData } = size;
                const sizeDoc = new ProductSizes(sizeData);
                await sizeDoc.save();
                allSizeDocs.push(sizeDoc);
                variantSizeMapping[id] = sizeDoc._id;
            }
        }

        // --- Step 2: Insert Variants ---
        const variantDocs = [];
        for (const variant of variants) {
            const { id, sizes, ...variantData } = variant;
            const sizeObjectIds = sizes.map(size => variantSizeMapping[size.id]);
            const variantDoc = new ProductVariant({
                ...variantData,
                sizes: sizeObjectIds
            });
            await variantDoc.save();
            variantDocs.push(variantDoc);
        }
        console.log(tags);

        // --- Step 3: Insert Product ---
        const product = await Product.create({
            name,
            description,
            price: Number(price),
            category,
            parent_category,
            store_id: storeId,
            attributes,
            stock,
            images,
            // tags,
            slug,
            variants: variantDocs.map(v => v._id),
        });

        // --- Step 4: Add product to store category automatically ---
        if (category) {
            const categoryDoc = await StoreCategoryModel.findOne({
                _id: category,
                store_id: storeId
            });

            if (categoryDoc) {
                categoryDoc.products.push(product._id);
                await categoryDoc.save();
            }
        }

        // Also add to explicitly provided storeCategory if different from category
        if (storeCategory && storeCategory !== category) {
            const explicitCategoryDoc = await StoreCategoryModel.findOne({
                _id: storeCategory,
                store_id: storeId
            });

            if (explicitCategoryDoc) {
                explicitCategoryDoc.products.push(product._id);
                await explicitCategoryDoc.save();
            }
        }

        return reply.code(201).send(new ApiResponse(201, product, "Product added successfully"));
    } catch (error) {
        request.log?.error?.(error);
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while adding the product"));
    }
};



const getStoreProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const {
            category,
            parent_category,
            tags,
            minPrice,
            maxPrice,
            page = 1,
            limit = 20,
            search,
            sort = "created_at",
            order = "desc",
            status,
            stock_level,
            date_from,
            date_to,
        } = request.query
        console.log(request.query);

        const skip = (page - 1) * limit
        const filter = { store_id: storeId }

        // Apply search filter
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { sku: { $regex: search, $options: "i" } }
            ]
        }

        // Apply filters
        if (category && category !== "all") filter.category = category
        if (parent_category && parent_category !== "all") filter.parent_category = parent_category
        if (tags) {
            const tagArray = tags.split(",")
            filter["tags.tagName"] = { $in: tagArray }
        }
        if (minPrice || maxPrice) {
            filter.price = {}
            if (minPrice) filter.price.$gte = Number(minPrice)
            if (maxPrice) filter.price.$lte = Number(maxPrice)
        }

        // Status filter
        if (status && status !== "all") {
            filter.status = status
        }

        // Stock level filter
        if (stock_level && stock_level !== "all") {
            switch (stock_level) {
                case "in_stock":
                    filter["stock.quantity"] = { $gt: 0 }
                    break
                case "low_stock":
                    filter["stock.quantity"] = { $gt: 0, $lt: 10 }
                    break
                case "out_of_stock":
                    filter["stock.quantity"] = { $lte: 0 }
                    break
                case "high_stock":
                    filter["stock.quantity"] = { $gt: 100 }
                    break
            }
        }

        // Date range filter
        if (date_from || date_to) {
            filter.created_at = {}
            if (date_from) filter.created_at.$gte = new Date(date_from)
            if (date_to) {
                // Add one day to date_to to include the entire day
                const endDate = new Date(date_to)
                endDate.setDate(endDate.getDate() + 1)
                filter.created_at.$lt = endDate
            }
        }

        // Build sort object
        const sortObj = {}
        sortObj[sort] = order === "desc" ? -1 : 1

        const [products, total] = await Promise.all([
            Product.find(filter)
                .populate("category", "name display_name")
                .populate("parent_category", "name display_name")
                .populate("variants")
                .sort(sortObj)
                .skip(skip)
                .limit(Number(limit)),

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
                        hasNext: page < Math.ceil(total / limit),
                        hasPrev: page > 1,
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

        const product = await Product.findOne({ _id: productId, store_id: storeId })
            .populate("category", "_id")
            .populate({
                path: "variants",
                populate: {
                    path: "sizes",
                    model: "ProductSizes"
                }
            });


        if (!product) {
            return reply.code(404).send(new ApiResponse(404, {}, "Product not found"))
        }


        if (product.category) {
            product.category = product.category._id
        } else {
            product.category = null
        }
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
        const storeId = request.user.store_id || request.body.store_id;
        const updateData = { ...request.body, updated_at: new Date() };

        // Parse JSON fields if they are strings
        if (typeof updateData.stock === "string") {
            updateData.stock = JSON.parse(updateData.stock);
        }
        if (typeof updateData.tags === "string") {
            updateData.tags = JSON.parse(updateData.tags);

        }
        if (typeof updateData.variants === "string") {
            updateData.variants = JSON.parse(updateData.variants);
        }

        // Fetch existing product
        const existingProduct = await Product.findOne({ _id: productId, store_id: storeId });
        if (!existingProduct) {
            return reply.code(404).send(new ApiResponse(404, {}, "Product not found"));
        }

        // --- Step 1: Handle category changes ---
        const oldCategoryId = existingProduct.category;
        const newCategoryId = updateData.category;
        const storeCategory = updateData.storeCategory;

        // --- Step 2: Clean up old variants and sizes ---
        if (existingProduct.variants?.length > 0) {
            const oldVariants = await ProductVariant.find({ _id: { $in: existingProduct.variants } });
            for (const variant of oldVariants) {
                await ProductSizes.deleteMany({ _id: { $in: variant.sizes } });
            }
            await ProductVariant.deleteMany({ _id: { $in: existingProduct.variants } });
        }

        // --- Step 3: Handle image merging ---
        if (updateData.image && Array.isArray(updateData.image) && updateData.image.length > 0) {
            const newImageUrls = updateData.image
                .map((file) => file?.path || file?.secure_url)
                .filter((url) => typeof url === "string" && url.trim().length > 0);
            updateData.images = [...(existingProduct.images || []), ...newImageUrls];
        }

        if (updateData.images && Array.isArray(updateData.images)) {
            updateData.images = updateData.images.filter((url) => typeof url === "string" && url.trim());
        }

        // --- Step 4: Create new sizes and variants ---
        const variantSizeMapping = {};
        const variantDocs = [];

        for (const variant of updateData.variants || []) {
            const { sizes = [], id, ...variantData } = variant;

            const sizeObjectIds = [];
            for (const size of sizes) {
                const { id, ...sizeData } = size;
                const sizeDoc = new ProductSizes(sizeData);
                await sizeDoc.save();
                variantSizeMapping[size.id] = sizeDoc._id;
                sizeObjectIds.push(sizeDoc._id);
            }

            const variantDoc = new ProductVariant({
                ...variantData,
                sizes: sizeObjectIds,
            });

            await variantDoc.save();
            variantDocs.push(variantDoc._id);
        }
        console.log(updateData.tags);

        // --- Step 5: Update product ---
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: productId, store_id: storeId },
            {
                ...updateData,
                variants: variantDocs,
            },
            { new: true }
        ).populate("category").populate("variants");

        // --- Step 6: Handle category updates ---
        // Remove from old category if category changed
        if (oldCategoryId && newCategoryId && !oldCategoryId.equals(newCategoryId)) {
            const oldCategoryDoc = await StoreCategoryModel.findOne({
                _id: oldCategoryId,
                store_id: storeId
            });

            if (oldCategoryDoc) {
                oldCategoryDoc.products.pull(productId);
                await oldCategoryDoc.save();
            }
        }

        // Add to new category if category is provided and changed
        if (newCategoryId && (!oldCategoryId || !oldCategoryId.equals(newCategoryId))) {
            const newCategoryDoc = await StoreCategoryModel.findOne({
                _id: newCategoryId,
                store_id: storeId
            });

            if (newCategoryDoc && !newCategoryDoc.products.includes(productId)) {
                newCategoryDoc.products.push(productId);
                await newCategoryDoc.save();
            }
        }

        // Handle storeCategory (additional category assignment)
        if (storeCategory) {
            const explicitCategoryDoc = await StoreCategoryModel.findOne({
                _id: storeCategory,
                store_id: storeId
            });

            if (explicitCategoryDoc && !explicitCategoryDoc.products.includes(productId)) {
                explicitCategoryDoc.products.push(productId);
                await explicitCategoryDoc.save();
            }
        }

        // If category was removed (set to null/undefined), remove from old category
        if ((newCategoryId === null || newCategoryId === undefined) && oldCategoryId) {
            const oldCategoryDoc = await StoreCategoryModel.findOne({
                _id: oldCategoryId,
                store_id: storeId
            });

            if (oldCategoryDoc) {
                oldCategoryDoc.products.pull(productId);
                await oldCategoryDoc.save();
            }
        }

        return reply.code(200).send(new ApiResponse(200, updatedProduct, "Product updated successfully"));
    } catch (error) {
        request.log?.error?.(error);



        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating the product"));
    }
};


// 5. Delete Product
const deleteProduct = async (request, reply) => {
    try {
        const { productId } = request.params
        const storeId = request.user.store_id

        const deleted = await Product.findOneAndDelete({ _id: productId, store_id: storeId })
        await TrendingProduct.findByIdAndDelete({ product_id: productId })
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
    toggleProductStatus
}
