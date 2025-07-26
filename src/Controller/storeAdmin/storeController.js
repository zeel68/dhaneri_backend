import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import { Store } from "../../Models/storeModel.js"
import { deleteFromCloudinary } from "../../Middleware/upload.middleware.js"
import {extractPublicId} from "../../utils/upload.js";
// 1. Get Store Details
const getStoreDetails = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId)
            .populate("category_id", "name description")
            .populate("owner_id", "name email")

        if (!store) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, store, "Store details fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store details"))
    }
}

// 2. Update Store Configuration
const updateStoreConfig = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const {
            name,
            description,
            contact_info,
            address,
            business_hours,
            social_media,
            seo_settings,
            payment_methods,
            shipping_zones,
            tax_settings,
        } = request.body

        // Get existing store to handle logo/banner updates
        const existingStore = await Store.findById(storeId)
        if (!existingStore) {
            // Clean up uploaded files if store doesn't exist
            if (request.files) {
                for (const fieldFiles of Object.values(request.files)) {
                    for (const file of fieldFiles) {
                        if (file.public_id) {
                            try {
                                await deleteFromCloudinary(file.public_id)
                            } catch (cleanupError) {
                                console.error("Error cleaning up uploaded file:", cleanupError)
                            }
                        }
                    }
                }
            }
            throw new ApiError(404, "Store not found")
        }

        const updateData = {
            ...(name && { name }),
            ...(description && { description }),
            ...(contact_info && { contact_info: JSON.parse(contact_info) }),
            ...(address && { address: JSON.parse(address) }),
            ...(business_hours && { business_hours: JSON.parse(business_hours) }),
            ...(social_media && { social_media: JSON.parse(social_media) }),
            ...(seo_settings && { seo_settings: JSON.parse(seo_settings) }),
            ...(payment_methods && { payment_methods: JSON.parse(payment_methods) }),
            ...(shipping_zones && { shipping_zones: JSON.parse(shipping_zones) }),
            ...(tax_settings && { tax_settings: JSON.parse(tax_settings) }),
            updated_at: new Date(),
        }

        // Handle logo upload
        if (request.files && request.files.store_logo && request.files.store_logo[0]) {
            const logoFile = request.files.store_logo[0]
            updateData.logo_url = logoFile.path || logoFile.secure_url

            // Delete old logo
            if (existingStore.logo_url) {
                const oldLogoPublicId = extractPublicId(existingStore.logo_url)
                if (oldLogoPublicId) {
                    try {
                        await deleteFromCloudinary(oldLogoPublicId)
                    } catch (deleteError) {
                        console.error("Error deleting old logo:", deleteError)
                    }
                }
            }
        }

        // Handle banner upload
        if (request.files && request.files.store_banner && request.files.store_banner[0]) {
            const bannerFile = request.files.store_banner[0]
            updateData.banner_url = bannerFile.path || bannerFile.secure_url

            // Delete old banner
            if (existingStore.banner_url) {
                const oldBannerPublicId = extractPublicId(existingStore.banner_url)
                if (oldBannerPublicId) {
                    try {
                        await deleteFromCloudinary(oldBannerPublicId)
                    } catch (deleteError) {
                        console.error("Error deleting old banner:", deleteError)
                    }
                }
            }
        }

        const updatedStore = await Store.findByIdAndUpdate(storeId, updateData, {
            new: true,
            runValidators: true,
        }).populate("category_id", "name description")

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store configuration updated successfully"))
    } catch (error) {
        request.log?.error?.(error)

        // Clean up uploaded files if update fails
        if (request.files) {
            for (const fieldFiles of Object.values(request.files)) {
                for (const file of fieldFiles) {
                    if (file.public_id) {
                        try {
                            await deleteFromCloudinary(file.public_id)
                        } catch (cleanupError) {
                            console.error("Error cleaning up uploaded file:", cleanupError)
                        }
                    }
                }
            }
        }

        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating store configuration"))
    }
}

// 3. Get Store Configuration
const getStoreConfig = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId).select(
            "name description logo_url banner_url contact_info address business_hours social_media seo_settings payment_methods shipping_zones tax_settings",
        )

        if (!store) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, store, "Store configuration fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store configuration"))
    }
}

// 4. Update Store Theme
const updateStoreTheme = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { theme_settings } = request.body

        if (!theme_settings) {
            throw new ApiError(400, "Theme settings are required")
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                theme_settings: JSON.parse(theme_settings),
                updated_at: new Date(),
            },
            { new: true, runValidators: true },
        ).select("theme_settings")

        if (!updatedStore) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store theme updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating store theme"))
    }
}

// 5. Get Store Theme
const getStoreTheme = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId).select("theme_settings")

        if (!store) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, store.theme_settings || {}, "Store theme fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store theme"))
    }
}

// 6. Update Store Features
const updateStoreFeatures = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { features } = request.body

        if (!features) {
            throw new ApiError(400, "Features configuration is required")
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                features: JSON.parse(features),
                updated_at: new Date(),
            },
            { new: true, runValidators: true },
        ).select("features")

        if (!updatedStore) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store features updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating store features"))
    }
}

// 7. Update Store Attributes
const updateStoreAttributes = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { attributes } = request.body

        if (!attributes) {
            throw new ApiError(400, "Attributes configuration is required")
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                attributes: JSON.parse(attributes),
                updated_at: new Date(),
            },
            { new: true, runValidators: true },
        ).select("attributes")

        if (!updatedStore) {
            throw new ApiError(404, "Store not found")
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store attributes updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        if (error instanceof ApiError) {
            return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
        }
        return reply.code(500).send(new ApiResponse(500, {}, "Error updating store attributes"))
    }
}

export {
    getStoreDetails,
    updateStoreConfig,
    getStoreConfig,
    updateStoreTheme,
    getStoreTheme,
    updateStoreFeatures,
    updateStoreAttributes,
}
