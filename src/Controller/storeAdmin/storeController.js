// 1. Get Store Details
const getStoreDetails = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId)
            .populate("category_id", "name image_url")
            .populate("products_count")
            .populate("orders_count")
            .populate("users_count")

        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, store, "Store details fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching store details"))
    }
}

// 2. Update Store Configuration
const updateStoreConfig = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { config } = request.body

        if (!config || typeof config !== "object") {
            return reply.code(400).send(new ApiResponse(400, {}, "Valid config object is required"))
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                config: { ...config },
                updated_at: new Date(),
            },
            { new: true },
        ).populate("category_id", "name")

        if (!updatedStore) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store configuration updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating store configuration"))
    }
}

// 3. Update Store Theme
const updateStoreTheme = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { primary_color, secondary_color, font_family, custom_css } = request.body

        const themeUpdate = {}
        if (primary_color) themeUpdate["theme.primary_color"] = primary_color
        if (secondary_color) themeUpdate["theme.secondary_color"] = secondary_color
        if (font_family) themeUpdate["theme.font_family"] = font_family
        if (custom_css !== undefined) themeUpdate["theme.custom_css"] = custom_css

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                ...themeUpdate,
                updated_at: new Date(),
            },
            { new: true },
        )

        if (!updatedStore) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore.theme, "Store theme updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating store theme"))
    }
}

// 4. Update Store Features
const updateStoreFeatures = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { features } = request.body

        if (!features || !Array.isArray(features)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Features array is required"))
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                features: features.map((feature) => ({ feature_name: feature })),
                updated_at: new Date(),
            },
            { new: true },
        )

        if (!updatedStore) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore.features, "Store features updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating store features"))
    }
}

// 5. Update Store Attributes
const updateStoreAttributes = async (request, reply) => {
    try {
        const storeId = request.user.store_id
        const { attributes } = request.body

        if (!attributes || !Array.isArray(attributes)) {
            return reply.code(400).send(new ApiResponse(400, {}, "Attributes array is required"))
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            {
                attributes: attributes.map((attr) => ({
                    attribute_name: attr.name,
                    attribute_value: attr.value,
                })),
                updated_at: new Date(),
            },
            { new: true },
        )

        if (!updatedStore) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, updatedStore.attributes, "Store attributes updated successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while updating store attributes"))
    }
}

// 6. Get Store Theme
const getStoreTheme = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId).select("theme")

        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(new ApiResponse(200, store.theme, "Store theme fetched successfully"))
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching store theme"))
    }
}

// 7. Get Store Configuration
const getStoreConfig = async (request, reply) => {
    try {
        const storeId = request.user.store_id

        const store = await Store.findById(storeId).select("config features attributes")

        if (!store) {
            return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
        }

        return reply.code(200).send(
            new ApiResponse(
                200,
                {
                    config: store.config,
                    features: store.features,
                    attributes: store.attributes,
                },
                "Store configuration fetched successfully",
            ),
        )
    } catch (error) {
        request.log?.error?.(error)
        return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching store configuration"))
    }
}

export {
    getStoreDetails,
    updateStoreConfig,
    updateStoreTheme,
    updateStoreFeatures,
    updateStoreAttributes,
    getStoreTheme,
    getStoreConfig,
}
