import { User } from "../Models/userModel.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/AsyncHandler.js"
import jwt from "jsonwebtoken"
import { emailService } from "../utils/emailService.js"
import { otpService } from "../utils/otpService.js"
import { uploadOnCloudinary } from "../utils/upload.js"
import { Role } from "../Models/roleModel.js";
import { Store } from "../Models/storeModel.js";
import { Cart } from "../Models/cartModel.js";

// Generate Access and Refresh Tokens
const generateAccessAndRefereshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refresh_token = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

// Register User
// const registerUser = asyncHandler(async (request, reply) => {
//     const { name, email, phone_number, password, store_id = "customer" } = request.body
//     const role_name = "customer";
//     if ([name, email, phone_number, password].some((field) => field?.trim() === "")) {
//         return reply.code(400).send(new ApiError(400, "All fields are required"))
//     }

//     // Check if user already exists
//     const existedUser = await User.findOne({
//         $or: [{ email }, { phone_number }],
//     })

//     if (existedUser) {
//         return reply.code(409).send(new ApiError(409, "User with email or phone already exists"))
//     }

//     // Get role
//     const role = await Role.findOne({ name: role_name })
//     if (!role) {
//         return reply.code(400).send(new ApiError(400, "Invalid role"))
//     }

//     // Validate store_id for non-super admin users
//     if (role_name !== "super_admin") {
//         if (!store_id) {
//             return reply.code(400).send(new ApiError(400, "Store ID is required"))
//         }

//         const store = await Store.findById(store_id)
//         if (!store) {
//             return reply.code(400).send(new ApiError(400, "Invalid store"))
//         }
//     }

//     // Create user
//     const user = await User.create({
//         name,
//         email: email.toLowerCase(),
//         phone_number,
//         password,
//         role_id: role._id,
//         store_id: role_name !== "super_admin" ? store_id : undefined,
//     })

//     // Create cart for customer
//     if (role_name === "customer") {
//         await Cart.create({
//             user_id: user._id,
//             store_id,
//             items: [],
//         })
//     }

//     // Generate OTP for email verification
//     const emailOTP = otpService.generateOTP()
//     user.email_verification_otp = emailOTP
//     user.email_verification_expires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
//     await user.save()

//     // Send verification email
//     await emailService.sendEmail({
//         to: email,
//         subject: "Email Verification",
//         template: "email-verification",
//         data: {
//             name,
//             otp: emailOTP,
//             expiresIn: "10 minutes",
//         },
//     })

//     const createdUser = await User.findById(user._id)
//         .select("-password -refresh_token -email_verification_otp")
//         .populate("role_id", "name")
//         .populate("store_id", "name domain")

//     return reply
//         .code(201)
//         .send(new ApiResponse(201, createdUser, "User registered successfully. Please verify your email."))
// })
// Register User
const registerUser = asyncHandler(async (request, reply) => {
    const {
        name,
        email,
        phone_number,
        password,
        store_id = "customer",
        provider = "local",
        provider_id = null,
    } = request.body;

    const role_name = "customer";

    // Basic validation
    if (provider === "local") {
        if ([name, email, phone_number, password].some(field => !field?.trim())) {
            return reply.code(400).send(new ApiError(400, "All fields are required for local registration"));
        }
    } else {
        if (!provider_id || !email) {
            return reply.code(400).send(new ApiError(400, "Provider ID and email are required for social login"));
        }
    }

    // Check if user already exists or not
    const existingUser = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { phone_number }],
    });

    if (existingUser) {
        return reply.code(409).send(new ApiError(409, "User with this email or phone already exists"));
    }

    // Get role
    const role = await Role.findOne({ name: role_name });
    if (!role) {
        return reply.code(400).send(new ApiError(400, "Invalid user role"));
    }

    // Validate store for non-super admins
    let validStoreId = undefined;
    if (role_name !== "super_admin") {
        if (!store_id) {
            return reply.code(400).send(new ApiError(400, "Store ID is required"));
        }

        const store = await Store.findById(store_id);
        if (!store) {
            return reply.code(400).send(new ApiError(400, "Invalid store"));
        }

        validStoreId = store._id;
    }

    // Create new user
    const newUser = await User.create({
        name,
        email: email.toLowerCase(),
        phone_number,
        password: provider === "local" ? password : undefined,
        role_id: role._id,
        store_id: validStoreId,
        provider,
        provider_id,
        email_verified: provider !== "local",
    });

    // Create cart if role is customer
    if (role_name === "customer") {
        const cart = await Cart.create({
            user_id: newUser._id,
            store_id: validStoreId,
            items: [],
        });
        newUser.cart = cart._id;
        await newUser.save();
    }

    // Handle email verification only for local providers
    if (provider === "local") {
        const emailOTP = otpService.generateOTP();
        newUser.email_verification_otp = emailOTP;
        newUser.email_verification_expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await newUser.save();

        // Send OTP email
        await emailService.sendEmail({
            to: email,
            subject: "Email Verification",
            template: "email-verification",
            data: {
                name,
                otp: emailOTP,
                expiresIn: "10 minutes",
            },
        });
    }


    // Final response with populated user
    const createdUser = await User.findById(newUser._id)
        .select("-password -refresh_token -email_verification_otp")
        .populate("role_id", "name")
        .populate("store_id", "name domain");

    return reply.code(201).send(
        new ApiResponse(201, createdUser, provider === "local"
            ? "User registered successfully. Please verify your email."
            : "User registered via provider successfully.")
    );
});

// Login User
// assumed utility
const MAX_LOGIN_ATTEMPTS = 10000
const LOCK_TIME = 10 * 60 * 1000 // 30 minutes

const loginUser = asyncHandler(async (request, reply) => {
    try {
        const { email, phone_number, password, isGoogleLogin, name, profile_url } = request.body

        if (!email && !phone_number) {
            return reply.code(400).send(new ApiResponse(400, {}, "Email or phone number is required"))
        }

        let user = await User.findOne({
            $or: [{ phone_number }, { email }],
        }).select("+password +role_id +login_attempts.count +login_attempts.locked_until")

        const now = Date.now()

        // ✅ GOOGLE LOGIN
        if (isGoogleLogin) {
            if (!user) {
                // Register new user with Google info
                user = await User.create({
                    name: name || "Google User",
                    email,
                    phone_number,
                    profile_url,
                    provider: "google",
                    role_id: "686506949c994c0a5b08edf3", // default role for Google users
                })
            }

            const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id)

            const {
                _id,
                name: userName,
                email: userEmail,
                role_id,
                store_id,
                phone_number: userPhone,
                profile_url: userProfile,
            } = user

            return reply
                .setCookie("accessToken", accessToken, { httpOnly: true, secure: true, path: "/" })
                .setCookie("refreshToken", refreshToken, { httpOnly: true, secure: true, path: "/" })
                .code(200)
                .send(
                    new ApiResponse(
                        200,
                        {
                            user: {
                                _id,
                                name: userName,
                                email: userEmail,
                                role: role_id,
                                store_id,
                                phone_number: userPhone,
                                profile_url: userProfile,
                            },
                            accessToken,
                            refreshToken,
                        },
                        "Google login successful",
                    ),
                )
        }

        // 🔐 CREDENTIALS LOGIN
        if (!user) {
            return reply.code(404).send(new ApiResponse(404, {}, "User not found"))
        }

        // Check if account is locked
        if (user.login_attempts?.locked_until && user.login_attempts.locked_until > now) {
            return reply
                .code(423)
                .send(new ApiResponse(423, {}, `Account locked. Try again after ${new Date(user.login_attempts.locked_until).toLocaleTimeString()}`))
        }

        if (!password) {
            return reply.code(400).send(new ApiResponse(400, {}, "Password is required"))
        }

        const isPasswordValid = await user.isPasswordCorrect(password)
        if (!isPasswordValid) {
            // Track login attempts
            user.login_attempts.count = (user.login_attempts.count || 0) + 1
            if (user.login_attempts.count >= MAX_LOGIN_ATTEMPTS) {
                user.login_attempts.locked_until = new Date(now + LOCK_TIME)
            }
            await user.save()
            console.log(password);

            return reply.code(401).send(new ApiResponse(401, {}, "Invalid password"))
        }

        // Reset login attempts on success
        user.login_attempts.count = 0
        user.login_attempts.locked_until = null
        user.last_login = new Date()
        await user.save()

        const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id)
        const {
            _id,
            name: userName,
            email: userEmail,
            role_id,
            store_id,
            phone_number: userPhone,
            profile_url: userProfile,
        } = user

        return reply
            .setCookie("accessToken", accessToken, { httpOnly: true, secure: true, path: "/" })
            .setCookie("refreshToken", refreshToken, { httpOnly: true, secure: true, path: "/" })
            .code(200)
            .send(
                new ApiResponse(
                    200,
                    {
                        user: {
                            _id,
                            name: userName,
                            email: userEmail,
                            role: role_id,
                            store_id,
                            phone_number: userPhone,
                            profile_url: userProfile,
                        },
                        accessToken,
                        refreshToken,
                    },
                    "User logged in successfully",
                ),
            )
    } catch (err) {
        request.log.error(err)
        return reply.code(err.statusCode || 500).send(new ApiResponse(500, {}, err.message || "Internal Server Error"))
    }
})


// Logout User
const logoutUser = asyncHandler(async (request, reply) => {
    await User.findByIdAndUpdate(
        request.user._id,
        {
            $unset: {
                refresh_token: 1,
            },
        },
        { new: true },
    )

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    }

    return reply
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .code(200)
        .send(new ApiResponse(200, {}, "User logged out successfully"))
})

// Refresh Access Token
const refreshAccessToken = asyncHandler(async (request, reply) => {
    const incomingRefreshToken = request.cookies.refreshToken || request.body.refreshToken

    if (!incomingRefreshToken) {
        return reply.code(401).send(new ApiError(401, "Unauthorized request"))
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)

        if (!user) {
            return reply.code(401).send(new ApiError(401, "Invalid refresh token"))
        }
        console.log(user);

        if (incomingRefreshToken !== user?.refresh_token) {
            return reply.code(401).send(new ApiError(401, "Refresh token is expired or used"))
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshTokens(user._id)

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
        }

        return reply
            .setCookie("accessToken", accessToken, options)
            .setCookie("refreshToken", newRefreshToken, options)
            .send(
                new ApiResponse(
                    200,
                    {
                        accessToken,
                        refreshToken: newRefreshToken,
                    },
                    "Access token refreshed",
                ),
            )
    } catch (error) {
        return reply.code(401).send(new ApiError(401, error?.message || "Invalid refresh token"))
    }
})

// Verify Email
const verifyEmail = asyncHandler(async (request, reply) => {
    const { email, otp } = request.body

    if (!email || !otp) {
        return reply.code(400).send(new ApiError(400, "Email and OTP are required"))
    }

    const user = await User.findOne({ email })
    if (!user) {
        return reply.code(404).send(new ApiError(404, "User not found"))
    }

    if (user.email_verified) {
        return reply.code(400).send(new ApiError(400, "Email already verified"))
    }

    if (!user.email_verification_otp || user.email_verification_expires < new Date()) {
        return reply.code(400).send(new ApiError(400, "OTP expired or invalid"))
    }

    if (user.email_verification_otp !== otp) {
        return reply.code(400).send(new ApiError(400, "Invalid OTP"))
    }

    user.email_verified = true
    user.email_verification_otp = undefined
    user.email_verification_expires = undefined
    await user.save()

    return reply.code(200).send(new ApiResponse(200, {}, "Email verified successfully"))
})

// Resend Email Verification
const resendEmailVerification = asyncHandler(async (request, reply) => {
    const { email } = request.body

    if (!email) {
        return reply.code(400).send(new ApiError(400, "Email is required"))
    }

    const user = await User.findOne({ email })
    if (!user) {
        return reply.code(404).send(new ApiError(404, "User not found"))
    }

    if (user.email_verified) {
        return reply.code(400).send(new ApiError(400, "Email already verified"))
    }

    const emailOTP = otpService.generateOTP()
    user.email_verification_otp = emailOTP
    user.email_verification_expires = new Date(Date.now() + 10 * 60 * 1000)
    await user.save()

    await emailService.sendEmail({
        to: email,
        subject: "Email Verification",
        template: "email-verification",
        data: {
            name: user.name,
            otp: emailOTP,
            expiresIn: "10 minutes",
        },
    })

    return reply.code(200).send(new ApiResponse(200, {}, "Verification email sent"))
})

// Forgot Password
const forgotPassword = asyncHandler(async (request, reply) => {
    const { email } = request.body

    if (!email) {
        return reply.code(400).send(new ApiError(400, "Email is required"))
    }

    const user = await User.findOne({ email })
    if (!user) {
        return reply.code(404).send(new ApiError(404, "User not found"))
    }

    const resetOTP = otpService.generateOTP()
    user.password_reset_otp = resetOTP
    user.password_reset_expires = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    await user.save()

    await emailService.sendEmail({
        to: email,
        subject: "Password Reset",
        template: "password-reset",
        data: {
            name: user.name,
            otp: resetOTP,
            expiresIn: "15 minutes",
        },
    })

    return reply.code(200).send(new ApiResponse(200, {}, "Password reset OTP sent to email"))
})

// Reset Password
const resetPassword = asyncHandler(async (request, reply) => {
    const { email, otp, newPassword } = request.body

    if (!email || !otp || !newPassword) {
        return reply.code(400).send(new ApiError(400, "Email, OTP, and new password are required"))
    }

    const user = await User.findOne({ email })
    if (!user) {
        return reply.code(404).send(new ApiError(404, "User not found"))
    }

    if (!user.password_reset_otp || user.password_reset_expires < new Date()) {
        return reply.code(400).send(new ApiError(400, "OTP expired or invalid"))
    }

    if (user.password_reset_otp !== otp) {
        return reply.code(400).send(new ApiError(400, "Invalid OTP"))
    }

    user.password = newPassword
    user.password_reset_otp = undefined
    user.password_reset_expires = undefined
    await user.save()

    return reply.code(200).send(new ApiResponse(200, {}, "Password reset successfully"))
})

// Change Password
const changePassword = asyncHandler(async (request, reply) => {
    const { oldPassword, newPassword } = request.body

    if (!oldPassword || !newPassword) {
        return reply.code(400).send(new ApiError(400, "Old password and new password are required"))
    }

    const user = await User.findById(request.user?._id).select("+password")
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        return reply.code(400).send(new ApiError(400, "Invalid old password"))
    }

    user.password = newPassword
    await user.save({ validateBeforeSave: false })

    return reply.code(200).send(new ApiResponse(200, {}, "Password changed successfully"))
})

// Get Current User
const getCurrentUser = asyncHandler(async (request, reply) => {
    const user = await User.findById(request.user._id)
        .populate("role_id", "name permissions")
        .populate("store_id", "name domain")
        .select("-password -refresh_token")

    return reply.code(200).send(new ApiResponse(200, user, "User fetched successfully"))
})



export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    verifyEmail,
    resendEmailVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    getCurrentUser,
}
