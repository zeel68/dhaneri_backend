

import jwt from "jsonwebtoken"
import { User } from "../Models/userModel.js";
import { Role } from "../Models/roleModel.js";

export async function verifyJWT(request, reply) {
    const token =
        // request.cookies?.accessToken ||
        request.headers.authorization?.replace('Bearer ', '')

    if (!token) {
        return reply.code(401).send({
            success: false,
            message: 'Access Token is required',
        })
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id).select('-password -refreshToken')

        if (!user) {
            return reply.code(401).send({
                success: false,
                message: 'Invalid Access Token',
            })
        }

        request.user = user
    } catch (error) {
        return reply.code(401).send({
            status: 401,
            success: false,
            message: error?.message || 'Invalid access token',
        })
    }
}

// Optional JWT verification - sets request.user if valid token, but doesn't reject if missing
export async function optionalVerifyJWT(request, reply) {
    const token = request.headers.authorization?.replace('Bearer ', '')

    if (!token) {
        request.user = null
        return
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id).select('-password -refreshToken')
        request.user = user || null
    } catch (error) {
        request.user = null
    }
}


// // 🛡️ Require Login Middleware
// export const requireUser = async (request, reply) => {
//     if (!request.user) {
//         return reply.code(401).send({ success: false, message: "User authentication required" });
//     }
// };

// 👑 Super Admin Middleware
export const isSuperAdmin = async (request, reply) => {
    // console.log(request.user)
    const role = await Role.findOne(request.user.role_id)
    console.log(role)
    if (!request.user || role.name !== "super_admin") {
        return reply.code(403).send({ success: false, message: "Super admin access required" });
    }
};

// 🏬 Store Owner Middleware
export const isStoreOwner = async (request, reply) => {
    const userRole = await Role.findById(request.user.role_id)
    console.log("role", userRole.name)

    if (!request.user || (userRole.name !== "store_admin" && userRole.name !== "super_admin")) {
        return reply.code(403).send({ success: false, message: "Store owner access required" });
    }
};

// 🛒 Customer Middleware
export const isCustomer = async (request, reply) => {
    if (!request.user || request.user.role_name !== "customer") {
        return reply.code(403).send({ success: false, message: "Customer access required" });
    }
};
