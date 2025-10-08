import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import { Product } from "../../Models/productModel.js"
import { HeroSlide, Testimonial, TrendingCategory, TrendingProduct } from "../../Models/homepageModel.js"
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js"
import { deleteFromCloudinary } from "../../Middleware/upload.middleware.js"
import { extractPublicId } from "../../utils/upload.js";

// 1. Get Homepage Configuration (Dynamic)
const getHomepageConfig = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        console.warn("Home Page")

        // Get all dynamic homepage data
        const [heroSlides, trendingCategories, trendingProducts, testimonials] = await Promise.all([
            HeroSlide.find({ store_id: storeId, is_active: true }).sort({ display_order: 1 }),
            TrendingCategory.find({ store_id: storeId })
                .sort({ display_order: 1 })
                .populate({
                    path: "category_id",
                    model: "StoreCategory",
                    populate: {
                        path: "products",
                        model: "Product",
                        select: "name description price images stock ratings",
                    },
                }),
            TrendingProduct.find({ store_id: storeId })
                .sort({ display_order: 1 }),
            // .populate("product_id", "name description price images stock ratings"),
            //

            Testimonial.find({ store_id: storeId }).sort({ createdAt: -1 }),
        ])
        console.log("prod", trendingProducts);


        const homepageConfig = {
            heroSlides,
            trendingCategories,
            trendingProducts,
            testimonials,
        }

        return reply.code(200).send(new ApiResponse(200, homepageConfig, "Homepage configuration fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching homepage configuration"))
    }
}

// 2. Create Hero Slide
const createHeroSlide = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { title, subtitle, link, display_order = 0, image } = request.body

        // Handle uploaded image
        let image_url = image

        if (!image_url) {
            return reply.code(400).send(new ApiResponse(400, {}, "Hero image is required"))
        }

        const heroSlide = new HeroSlide({
            store_id: storeId,
            image_url,
            title,
            subtitle,
            link,
            display_order: Number(display_order),
            is_active: true,
        })

        await heroSlide.save()

        return reply.code(201).send(new ApiResponse(201, heroSlide, "Hero slide created successfully"))
    } catch (error) {
        request.log?.error?.(error)

        // Clean up uploaded file if hero slide creation fails
        if (request.file && request.file.public_id) {
            try {
                await deleteFromCloudinary(request.file.public_id)
            } catch (cleanupError) {
                console.error("Error cleaning up uploaded file:", cleanupError)
            }
        }

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error creating hero slide"))
    }
}

// 3. Update Hero Slide
const updateHeroSlide = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { slideId } = request.params
        console.log(request.body);

        const { title, subtitle, link, display_order, is_active, image } = request.body

        // Get existing slide to handle image replacement
        const existingSlide = await HeroSlide.findOne({ _id: slideId, store_id: storeId })


        const updateData = {
            ...(title !== undefined && { title }),
            ...(subtitle !== undefined && { subtitle }),
            ...(link !== undefined && { link }),
            ...(display_order !== undefined && { display_order: Number(display_order) }),
            ...(is_active !== undefined && { is_active: Boolean(is_active) }),
            ...(image !== undefined && { image_url: image })
        }

        console.log("update data", updateData);

        const updatedSlide = await HeroSlide.findOneAndUpdate(
            { _id: slideId, store_id: storeId },
            { $set: updateData },
            { new: true },
        )

        return reply.code(200).send(new ApiResponse(200, updatedSlide, "Hero slide updated successfully"))
    } catch (error) {
        request.log?.error?.(error)

        // Clean up uploaded file if update fails
        if (request.file && request.file.public_id) {
            try {
                await deleteFromCloudinary(request.file.public_id)
            } catch (cleanupError) {
                console.error("Error cleaning up uploaded file:", cleanupError)
            }
        }

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating hero slide"))
    }
}

// 4. Delete Hero Slide
const deleteHeroSlide = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { slideId } = request.params

        const deletedSlide = await HeroSlide.findOneAndDelete({ _id: slideId, store_id: storeId })

        if (!deletedSlide) {
            console.log(deleteHeroSlide);

            throw new ApiError(404, "Hero slide not found")
        }

        // Delete associated image from Cloudinary
        if (deletedSlide.image_url) {
            const publicId = extractPublicId(deletedSlide.image_url)
            if (publicId) {
                try {
                    await deleteFromCloudinary(publicId)
                } catch (deleteError) {
                    console.error("Error deleting image from Cloudinary:", deleteError)
                }
            }
        }

        return reply.code(200).send(new ApiResponse(200, {}, "Hero slide deleted successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error deleting hero slide"))
    }
}

// 5. Add Trending Category
const addTrendingCategory = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        console.log("request", request.body);

        const { category_id, display_order = 0 } = request.body

        if (!category_id) {
            throw new ApiError(400, "Category ID is required")
        }

        // Verify category exists
        const category = await StoreCategoryModel.findById(category_id)
        if (!category) {
            throw new ApiError(404, "Category not found")
        }

        // Check if already exists
        const existingTrending = await TrendingCategory.findOne({ store_id: storeId, category_id })
        if (existingTrending) {
            throw new ApiError(400, "Category is already in trending list")
        }

        const trendingCategory = new TrendingCategory({
            store_id: storeId,
            category_id,
            display_order: Number(display_order),
        })

        await trendingCategory.save()
        await trendingCategory.populate("category_id", "display_name description img_url")

        return reply.code(201).send(new ApiResponse(201, trendingCategory, "Trending category added successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error adding trending category"))
    }
}

// 6. Update Trending Category
const updateTrendingCategory = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { trending_id, display_order, category_id } = request.body

        const updateData = {}
        if (display_order !== undefined) updateData.display_order = Number(display_order)
        if (category_id !== undefined) updateData.category_id = category_id

        const updatedTrending = await TrendingCategory.findOneAndUpdate(
            { _id: trending_id, store_id: storeId },
            { $set: updateData },
            { new: true },
        ).populate("category_id", "display_name description img_url")

        if (!updatedTrending) {
            throw new ApiError(404, "Trending category not found")
        }

        return reply.code(200).send(new ApiResponse(200, updatedTrending, "Trending category updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating trending category"))
    }
}

// 7. Remove Trending Category
const removeTrendingCategory = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { trendingId } = request.params

        const deletedTrending = await TrendingCategory.findOneAndDelete({ _id: trendingId, store_id: storeId })

        if (!deletedTrending) {
            throw new ApiError(404, "Trending category not found")
        }

        return reply.code(200).send(new ApiResponse(200, {}, "Trending category removed successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error removing trending category"))
    }
}

// 8. Add Trending Product
const addTrendingProduct = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { product_id, display_order = 0 } = request.body

        if (!product_id) {
            throw new ApiError(400, "Product ID is required")
        }

        // Verify product exists and belongs to store
        const product = await Product.findOne({ _id: product_id, store_id: storeId })
        if (!product) {
            throw new ApiError(404, "Product not found or doesn't belong to this store")
        }

        // Check if already exists
        const existingTrending = await TrendingProduct.findOne({ store_id: storeId, product_id })
        if (existingTrending) {
            throw new ApiError(400, "Product is already in trending list")
        }

        const trendingProduct = new TrendingProduct({
            store_id: storeId,
            product_id,
            display_order: Number(display_order),
        })

        await trendingProduct.save()
        await trendingProduct.populate("product_id", "name description price images stock ratings")

        return reply.code(201).send(new ApiResponse(201, trendingProduct, "Trending product added successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error adding trending product"))
    }
}

// 9. Update Trending Product
const updateTrendingProduct = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { trendingId } = request.params
        const { display_order } = request.body

        const updatedTrending = await TrendingProduct.findOneAndUpdate(
            { _id: trendingId, store_id: storeId },
            { $set: { display_order: Number(display_order) } },
            { new: true },
        ).populate("product_id", "name description price images stock ratings")

        if (!updatedTrending) {
            throw new ApiError(404, "Trending product not found")
        }

        return reply.code(200).send(new ApiResponse(200, updatedTrending, "Trending product updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating trending product"))
    }
}

// 10. Remove Trending Product
const removeTrendingProduct = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { trendingId } = request.params

        const deletedTrending = await TrendingProduct.findOneAndDelete({ _id: trendingId, store_id: storeId })

        if (!deletedTrending) {
            throw new ApiError(404, "Trending product not found")
        }

        return reply.code(200).send(new ApiResponse(200, {}, "Trending product removed successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error removing trending product"))
    }
}

// 11. Create Testimonial
const createTestimonial = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { name, message } = request.body

        if (!name || !message) {
            throw new ApiError(400, "Name and message are required")
        }

        // Handle uploaded photo
        let photo_url = null
        if (request.file) {
            photo_url = request.file.path || request.file.secure_url
        }

        const testimonial = new Testimonial({
            store_id: storeId,
            name,
            message,
            photo_url,
        })

        await testimonial.save()

        return reply.code(201).send(new ApiResponse(201, testimonial, "Testimonial created successfully"))
    } catch (error) {
        request.log?.error?.(error)

        // Clean up uploaded file if testimonial creation fails
        if (request.file && request.file.public_id) {
            try {
                await deleteFromCloudinary(request.file.public_id)
            } catch (cleanupError) {
                console.error("Error cleaning up uploaded file:", cleanupError)
            }
        }

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error creating testimonial"))
    }
}

// 12. Update Testimonial
const updateTestimonial = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { testimonialId } = request.params
        const { name, message } = request.body

        // Get existing testimonial
        const existingTestimonial = await Testimonial.findOne({ _id: testimonialId, store_id: storeId })
        if (!existingTestimonial) {
            // Clean up uploaded file if testimonial doesn't exist
            if (request.file && request.file.public_id) {
                try {
                    await deleteFromCloudinary(request.file.public_id)
                } catch (cleanupError) {
                    console.error("Error cleaning up uploaded file:", cleanupError)
                }
            }
            throw new ApiError(404, "Testimonial not found")
        }

        const updateData = {
            ...(name && { name }),
            ...(message && { message }),
        }

        // Handle new photo upload
        if (request.file) {
            const newPhotoUrl = request.file.path || request.file.secure_url
            updateData.photo_url = newPhotoUrl

            // Delete old photo from Cloudinary
            if (existingTestimonial.photo_url) {
                const oldPublicId = extractPublicId(existingTestimonial.photo_url)
                if (oldPublicId) {
                    try {
                        await deleteFromCloudinary(oldPublicId)
                    } catch (deleteError) {
                        console.error("Error deleting old photo:", deleteError)
                    }
                }
            }
        }

        const updatedTestimonial = await Testimonial.findOneAndUpdate(
            { _id: testimonialId, store_id: storeId },
            { $set: updateData },
            { new: true },
        )

        return reply.code(200).send(new ApiResponse(200, updatedTestimonial, "Testimonial updated successfully"))
    } catch (error) {
        request.log?.error?.(error)

        // Clean up uploaded file if update fails
        if (request.file && request.file.public_id) {
            try {
                await deleteFromCloudinary(request.file.public_id)
            } catch (cleanupError) {
                console.error("Error cleaning up uploaded file:", cleanupError)
            }
        }

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating testimonial"))
    }
}

// 13. Delete Testimonial
const deleteTestimonial = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { testimonialId } = request.params

        const deletedTestimonial = await Testimonial.findOneAndDelete({ _id: testimonialId, store_id: storeId })

        if (!deletedTestimonial) {
            throw new ApiError(404, "Testimonial not found")
        }

        // Delete associated photo from Cloudinary
        if (deletedTestimonial.photo_url) {
            const publicId = extractPublicId(deletedTestimonial.photo_url)
            if (publicId) {
                try {
                    await deleteFromCloudinary(publicId)
                } catch (deleteError) {
                    console.error("Error deleting photo from Cloudinary:", deleteError)
                }
            }
        }

        return reply.code(200).send(new ApiResponse(200, {}, "Testimonial deleted successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error deleting testimonial"))
    }
}

// 14. Get Hero Slides
const getHeroSlides = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const heroSlides = await HeroSlide.find({ store_id: storeId }).sort({ display_order: 1 })

        return reply.code(200).send(new ApiResponse(200, heroSlides, "Hero slides fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching hero slides"))
    }
}

// 15. Get Trending Categories
const getTrendingCategories = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const trendingCategories = await TrendingCategory.find({ store_id: storeId })
        // .populate("category_id", "display_name description img_url")
        // .sort({ display_order: 1 })

        return reply.code(200).send(new ApiResponse(200, trendingCategories, "Trending categories fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching trending categories"))
    }
}

// 16. Get Trending Products
const getTrendingProducts = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const trendingProducts = await TrendingProduct.find({ store_id: storeId })
            .populate("product_id", "name description price images stock ratings")
            .sort({ display_order: 1 })

        return reply.code(200).send(new ApiResponse(200, trendingProducts, "Trending products fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching trending products"))
    }
}

// 17. Get Testimonials
const getTestimonials = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const testimonials = await Testimonial.find({ store_id: storeId }).sort({ createdAt: -1 })

        return reply.code(200).send(new ApiResponse(200, testimonials, "Testimonials fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching testimonials"))
    }
}

export {
    getHomepageConfig,
    createHeroSlide,
    updateHeroSlide,
    deleteHeroSlide,
    addTrendingCategory,
    updateTrendingCategory,
    removeTrendingCategory,
    addTrendingProduct,
    updateTrendingProduct,
    removeTrendingProduct,
    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
    getHeroSlides,
    getTrendingCategories,
    getTrendingProducts,
    getTestimonials,
}
