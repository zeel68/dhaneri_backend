import { Store } from "../model/store.Model.js"

// Middleware to ensure user is a store owner and has access to their store
export const verifyStoreAccess = async (request, reply) => {
    try {
        const user = request.user

        if (!user) {
            return reply.code(401).send({
                success: false,
                message: "Authentication required",
            })
        }

        // Check if user has store_id
        if (!user.store_id) {
            return reply.code(403).send({
                success: false,
                message: "No store assigned to this user",
            })
        }

        // Verify store exists and is active
        const store = await Store.findById(user.store_id)
        if (!store) {
            return reply.code(404).send({
                success: false,
                message: "Store not found",
            })
        }

        if (!store.is_active) {
            return reply.code(403).send({
                success: false,
                message: "Store is not active",
            })
        }

        // Add store info to request for easy access
        request.store = store
    } catch (error) {
        return reply.code(500).send({
            success: false,
            message: "Error verifying store access",
        })
    }
}

// Middleware to check if user can access specific store (for routes with store_id param)
export const verifyStoreOwnership = async (request, reply) => {
    try {
        const { store_id } = request.params
        const userStoreId = request.user.store_id

        if (store_id && store_id !== userStoreId.toString()) {
            return reply.code(403).send({
                success: false,
                message: "Access denied: You can only manage your own store",
            })
        }
    } catch (error) {
        return reply.code(500).send({
            success: false,
            message: "Error verifying store ownership",
        })
    }
}

// Middleware to validate store admin permissions for specific actions
export const validateStoreAdminAction = (action) => {
    return async (request, reply) => {
        try {
            const user = request.user
            const store = request.store

            // Define permissions for different actions
            const permissions = {
                manage_products: ["storeowner"],
                manage_orders: ["storeowner"],
                manage_customers: ["storeowner"],
                view_analytics: ["storeowner"],
                manage_store_config: ["storeowner"],
                manage_homepage: ["storeowner"],
            }

            const allowedRoles = permissions[action]

            if (!allowedRoles || !allowedRoles.includes(user.role_name)) {
                return reply.code(403).send({
                    success: false,
                    message: `Insufficient permissions for action: ${action}`,
                })
            }
        } catch (error) {
            return reply.code(500).send({
                success: false,
                message: "Error validating permissions",
            })
        }
    }
}
