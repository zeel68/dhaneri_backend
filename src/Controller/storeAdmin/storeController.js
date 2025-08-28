import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import { Store } from "../../Models/storeModel.js"
import { deleteFromCloudinary } from "../../Middleware/upload.middleware.js"
import { extractPublicId } from "../../utils/upload.js";
import { StoreCategoryModel } from "../../Models/storeCategoryModel.js";
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
        const storeId = request.user.store_id;

        // Extract all config fields from request body
        const {
            name, // This will be stored at top level
            description,
            contact_info,
            address,
            business_hours,
            social_media,
            seo_settings,
            payment_methods,
            shipping_zones,
            tax_settings,
            // Any other config fields can be added here
        } = request.body.config || {};

        // Prepare update data
        const updateData = {
            updated_at: new Date(),
        };

        // Set top-level name if provided
        if (name) {
            updateData.name = name;
        }

        // Prepare config object for nested fields
        const configUpdate = {};

        // Add all config fields if they exist
        if (description !== undefined) configUpdate.description = description;
        if (contact_info !== undefined) configUpdate.contact_info = contact_info;
        if (address !== undefined) configUpdate.address = address;
        if (business_hours !== undefined) configUpdate.business_hours = business_hours;
        if (social_media !== undefined) configUpdate.social_media = social_media;
        if (seo_settings !== undefined) configUpdate.seo_settings = seo_settings;
        if (payment_methods !== undefined) configUpdate.payment_methods = payment_methods;
        if (shipping_zones !== undefined) configUpdate.shipping_zones = shipping_zones;
        if (tax_settings !== undefined) configUpdate.tax_settings = tax_settings;

        // Only add config to update if there are config changes
        if (Object.keys(configUpdate).length > 0) {
            // Use $set operator to update config fields without replacing entire config
            updateData.$set = {
                ...updateData.$set,
                ...Object.fromEntries(
                    Object.entries(configUpdate).map(([key, value]) => [`config.${key}`, value])
                )
            };
        }

        const updatedStore = await Store.findByIdAndUpdate(
            storeId,
            updateData,
            {
                new: true,
                runValidators: true,
            }
        ).populate("category_id", "name description");

        return reply.code(200).send(new ApiResponse(200, updatedStore, "Store configuration updated successfully"));
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

        // Validate storeId
        if (!storeId) {
            return reply.code(400).send(new ApiResponse(400, {}, "Store ID is required"))

        }

        // Fetch store with all necessary data
        const store = await Store.findById(storeId)
            .populate('category_details')
            .populate('products_count')
            .populate('orders_count')
            .populate('users_count')
            .lean();

        if (!store) {
            return res.status(404).json({
                success: false,
                message: 'Store not found'
            });
        }

        // Fetch store categories with their configurations
        const storeCategories = await StoreCategoryModel.find({ store_id: storeId })
            .populate('category_id')
            .lean();

        // Format the response according to what the frontend expects
        const storeConfig = {
            // Basic store information
            _id: store._id,
            name: store.name,
            domain: store.domain,
            category_id: store.category_id,
            logo_url: store.logo,
            banner_url: store.config?.banner_url || null,
            description: store.config?.description || '',
            is_active: store.is_active,

            // Contact information
            contact_info: {
                email: store.config?.contact_info?.email || '',
                phone: store.config?.contact_info?.phone || '',
                website: store.config?.contact_info?.website || ''
            },

            // Address information
            address: {
                street: store.config?.address?.street || '',
                city: store.config?.address?.city || '',
                state: store.config?.address?.state || '',
                country: store.config?.address?.country || '',
                postal_code: store.config?.address?.postal_code || ''
            },

            // Social media
            social_media: {
                facebook: store.config?.social_media?.facebook || '',
                twitter: store.config?.social_media?.twitter || '',
                instagram: store.config?.social_media?.instagram || '',
                linkedin: store.config?.social_media?.linkedin || ''
            },

            // Theme settings
            theme_settings: {
                primary_color: store.theme?.primary_color || '#4f46e5',
                secondary_color: store.theme?.secondary_color || '#f43f5e',
                font_family: store.theme?.font_family || "'Inter', sans-serif",
                custom_css: store.theme?.custom_css || '',
                layout: store.config?.theme_settings?.layout || 'modern'
            },

            // SEO settings
            seo_settings: {
                meta_title: store.config?.seo_settings?.meta_title || '',
                meta_description: store.config?.seo_settings?.meta_description || '',
                keywords: store.config?.seo_settings?.keywords || []
            },

            // Payment settings
            payment_methods: store.config?.payment_methods || [],
            tax_settings: {
                tax_rate: store.config?.tax_settings?.tax_rate || 0,
                tax_inclusive: store.config?.tax_settings?.tax_inclusive || false
            },

            // Shipping settings
            shipping_zones: store.config?.shipping_zones || [],

            // Notification settings
            notification_settings: {
                email_notifications: store.config?.notification_settings?.email_notifications || {
                    new_orders: true,
                    low_stock: true,
                    customer_reviews: true,
                    payment_received: true,
                    refund_requests: false,
                    system_updates: true
                },
                sms_notifications: store.config?.notification_settings?.sms_notifications || {
                    new_orders: false,
                    urgent_alerts: true,
                    payment_failures: true
                },
                push_notifications: store.config?.notification_settings?.push_notifications || {
                    new_orders: true,
                    customer_messages: true,
                    inventory_alerts: true
                },
                email_settings: store.config?.notification_settings?.email_settings || {
                    from_name: "Your Store",
                    from_email: "noreply@yourstore.com",
                    reply_to: "support@yourstore.com",
                    smtp_host: "",
                    smtp_port: 587,
                    smtp_username: "",
                    smtp_password: "",
                    smtp_encryption: "tls"
                },
                notification_frequency: store.config?.notification_settings?.notification_frequency || "immediate",
                quiet_hours: store.config?.notification_settings?.quiet_hours || {
                    enabled: false,
                    start_time: "22:00",
                    end_time: "08:00"
                }
            },

            // Security settings
            security_settings: {
                two_factor_auth: store.config?.security_settings?.two_factor_auth || false,
                password_policy: store.config?.security_settings?.password_policy || {
                    min_length: 8,
                    require_uppercase: true,
                    require_lowercase: true,
                    require_numbers: true,
                    require_symbols: false
                },
                session_timeout: store.config?.security_settings?.session_timeout || 30,
                login_attempts: store.config?.security_settings?.login_attempts || 5,
                account_lockout_duration: store.config?.security_settings?.account_lockout_duration || 15,
                ip_whitelist: store.config?.security_settings?.ip_whitelist || [],
                ssl_required: store.config?.security_settings?.ssl_required || true,
                secure_cookies: store.config?.security_settings?.secure_cookies || true,
                csrf_protection: store.config?.security_settings?.csrf_protection || true
            },

            // Store categories with their configurations
            categories: storeCategories.map(category => ({
                _id: category._id,
                category_id: category.category_id,
                slug: category.slug,
                is_primary: category.is_primary,
                img_url: category.img_url,
                display_name: category.display_name,
                description: category.description,
                sort_order: category.sort_order,
                is_active: category.is_active,
                config: category.config || {
                    filters: [],
                    attributes: []
                }
            })),

            // Additional store metrics
            products_count: store.products_count || 0,
            orders_count: store.orders_count || 0,
            users_count: store.users_count || 0,
            category_details: store.category_details || null,

            // Timestamps
            created_at: store.created_at,
            updated_at: store.updated_at
        };

        return reply.code(200).send(new ApiResponse(200, storeConfig, "Store theme updated successfully"))

    } catch (error) {
        console.error('Error fetching store config:', error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store config"))

    }
};
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
