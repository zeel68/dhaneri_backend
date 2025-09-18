import { uploadSingle } from "../Middleware/upload.middleware.js"
import {
    authLimiter,
    emailVerificationLimiter,
} from "../Middleware/rateLimiter.middleware.js"
import { verifyJWT } from "../Middleware/auth.middleware.js";
import {
    changePassword,
    forgotPassword, getCurrentUser,
    loginUser, logoutUser,
    refreshAccessToken,
    registerUser,
    resendEmailVerification, resetPassword,
    verifyEmail
} from "../Controller/authController.js";
import { addAddress, updateAccountDetails, updateUserAvatar } from "../Controller/userController.js"; // assumed JWT middleware

export default async function authRoutes(fastify, opts) {
    // Apply global auth rate limiter for all routes in this file
    await fastify.register(import("@fastify/rate-limit"), authLimiter)

    // 📦 Public routes
    fastify.post("/register", {

        // preHandler: [validate(commonSchemas.registerUser)],
        handler: registerUser,
    })

    fastify.post("/login", {
        // preHandler: [validate(commonSchemas.loginUser)],
        handler: loginUser,
    })

    fastify.post("/refresh-token", refreshAccessToken)

    // 📧 Email verification
    fastify.post("/verify-email", verifyEmail)

    fastify.post("/resend-verification", {
        config: { rateLimit: emailVerificationLimiter },
        handler: resendEmailVerification,
    })

    // 🔒 Password reset flow
    fastify.post("/forgot-password", {
        config: { rateLimit: emailVerificationLimiter },
        handler: forgotPassword,
    })

    fastify.post("/reset-password", resetPassword)

    // 🔐 Protected routes (JWT-required scope)
    fastify.register(async function (authProtectedRoutes) {
        // Add auth verification hook
        authProtectedRoutes.addHook("preHandler", verifyJWT)

        authProtectedRoutes.post("/logout", logoutUser)
        authProtectedRoutes.post("/addAddress", addAddress)
        authProtectedRoutes.post("/change-password", changePassword)
        authProtectedRoutes.get("/me", getCurrentUser)
        authProtectedRoutes.patch("/update-account", updateAccountDetails)

        authProtectedRoutes.patch("/avatar", {
            preHandler: [uploadSingle("avatar")],
            handler: updateUserAvatar,
        })
    })
}
