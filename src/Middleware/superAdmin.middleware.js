import { ApiError } from "../utils/ApiError.js"
import { Role } from "../model/role.Model.js"

/**
 * Middleware to verify if the authenticated user is a Super Admin
 */
export const verifySuperAdmin = async (request, reply) => {
    try {
        if (!request.user) {
            throw new ApiError(401, "Authentication required")
        }

        // Get user's role information
        const userRole = await Role.findById(request.user.role_id)
        console.log(userRole)
        if (!userRole || userRole.name !== "super_admin") {
            throw new ApiError(403, "Super Admin access required")
        }

        // Add role info to request for further use
        request.userRole = userRole
    } catch (error) {
        return reply.code(error.statusCode || 500).send({
            success: false,
            message: error.message || "Super Admin verification failed",
        })
    }
}

/**
 * Middleware to verify if user can manage a specific store
 */
export const verifyStoreAccess = async (request, reply) => {
    try {
        const { store_id } = request.params
        const user = request.user

        const userRole = await Role.findById(request.user.role_id)
        console.log(userRole)
        if (userRole.name === "super_admin") {
           return
        }

        // Store owner can only access their own store
        if (user.store_id && user.store_id.toString() === store_id) {
            return
        }

        throw new ApiError(403, "Access denied to this store")
    } catch (error) {
        return reply.code(error.statusCode || 500).send({
            success: false,
            message: error.message || "Store access verification failed",
        })
    }
}

/**
 * Middleware to log super admin actions for audit trail
 */
export const logSuperAdminAction = async (request, reply) => {
    try {
        const action = {
            admin_id: request.user._id,
            action: `${request.method} ${request.url}`,
            timestamp: new Date(),
            ip_address: request.ip,
            user_agent: request.headers["user-agent"],
        }

        // In a real application, you'd save this to an audit log collection
        console.log("Super Admin Action:", action)
    } catch (error) {
        console.error("Failed to log super admin action:", error)
    }
}
