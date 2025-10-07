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
import { Order } from "../Models/orderModel.js";

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
const registerUser = asyncHandler(async (request, reply) => {
    let {
        name,
        email,
        phone_number,
        password,
        store_id,
        provider = "local",
        provider_id = null,
        role_name
    } = request.body;
    if (!role_name) {
        role_name = "customer";
    }

    // Basic validation
    if (provider === "local") {
        if ([name, email, password].some(field => !field?.trim())) {
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

    console.log(role, role_name);

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

        // Send OTP email using the email service
        try {
            await emailService.sendEmailVerificationEmail(
                email,
                name,
                emailOTP,
                "10 minutes"
            );
        } catch (error) {
            console.error("Failed to send verification email:", error);
            // Continue with registration even if email fails
        }
    } else {
        // Send welcome email for social login
        try {
            await emailService.sendWelcomeEmail(
                email,
                name,
                `${process.env.FRONTEND_URL}/welcome`
            );
        } catch (error) {
            console.error("Failed to send welcome email:", error);
            // Continue with registration even if email fails
        }
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
const MAX_LOGIN_ATTEMPTS = 10000
const LOCK_TIME = 10 * 60 * 1000 // 10 minutes

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

            // Send login notification email
            try {
                const loginTime = new Date().toLocaleString();
                const loginLocation = request.ip || "Unknown";
                await emailService.sendLoginNotificationEmail(
                    userEmail,
                    userName,
                    loginTime,
                    loginLocation
                );
            } catch (error) {
                console.error("Failed to send login notification:", error);
                // Continue with login even if email fails
            }

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

        // Send login notification email
        try {
            const loginTime = new Date().toLocaleString();
            const loginLocation = request.ip || "Unknown";
            await emailService.sendLoginNotificationEmail(
                userEmail,
                userName,
                loginTime,
                loginLocation
            );
        } catch (error) {
            console.error("Failed to send login notification:", error);
            // Continue with login even if email fails
        }

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
    const incomingRefreshToken = request.body.refreshToken
    console.log("refreshToken", incomingRefreshToken);

    if (!incomingRefreshToken) {
        return reply.code(401).send(new ApiError(401, "Unauthorized request"))
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)

        if (!user) {
            return reply.code(403).send(new ApiError(403, "Invalid refresh token"))
        }

        console.log(incomingRefreshToken, "\n", user.refresh_token);

        if (incomingRefreshToken !== user?.refresh_token) {
            return reply.code(402).send(new ApiError(402, "Refresh token is expired or used"))
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefereshTokens(user._id)

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
        return reply.code(405).send(new ApiError(401, error?.message || "Invalid refresh token"))
    }
})

// Verify Email
// Verify Email
const verifyEmail = asyncHandler(async (request, reply) => {
    const { email, otp } = request.body

    if (!email || !otp) {
        return reply.code(400).send(new ApiError(400, "Email and OTP are required"))
    }

    const user = await User.findOne({ email }).select("+email_verification_otp +email_verification_expires")
    if (!user) {
        return reply.code(404).send(new ApiError(404, "User not found"))
    }

    if (user.email_verified) {
        return reply.code(400).send(new ApiError(400, "Email already verified"))
    }

    if (!user.email_verification_otp || user.email_verification_expires < Date.now()) {
        console.log(user.email_verification_expires, Date.now());
        return reply.code(400).send(new ApiError(400, "OTP expired or invalid"))
    }

    if (user.email_verification_otp !== otp) {
        return reply.code(400).send(new ApiError(400, "Invalid OTP"))
    }

    // Update email verification status
    user.email_verified = true
    user.email_verification_otp = undefined
    user.email_verification_expires = undefined
    user.last_login = new Date() // Update last login time
    await user.save()

    // Generate access and refresh tokens
    const { accessToken, refreshToken } = await generateAccessAndRefereshTokens(user._id)

    // Get user details for response
    const userDetails = await User.findById(user._id)
        .select("-password -refresh_token -email_verification_otp")
        .populate("role_id", "name")
        .populate("store_id", "name domain")

    // Set cookies for tokens
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    }

    // Send welcome email after successful verification
    try {
        await emailService.sendWelcomeEmail(
            email,
            user.name,
            `${process.env.FRONTEND_URL}/welcome`
        );
    } catch (error) {
        console.error("Failed to send welcome email:", error);
        // Continue with verification even if email fails
    }

    return reply
        .setCookie("accessToken", accessToken, options)
        .setCookie("refreshToken", refreshToken, options)
        .code(200)
        .send(
            new ApiResponse(
                200,
                {
                    user: userDetails,
                    accessToken,
                    refreshToken,
                },
                "Email verified successfully. User logged in."
            )
        )
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

    // Send verification email using the email service
    try {
        await emailService.sendEmailVerificationEmail(
            email,
            user.name,
            emailOTP,
            "10 minutes"
        );
    } catch (error) {
        console.error("Failed to send verification email:", error);
        return reply.code(500).send(new ApiError(500, "Failed to send verification email"))
    }

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

    // Send password reset email using the email service
    try {
        await emailService.sendPasswordResetEmail(
            email,
            user.name,
            resetOTP,
            "15 minutes"
        );
    } catch (error) {
        console.error("Failed to send password reset email:", error);
        return reply.code(500).send(new ApiError(500, "Failed to send password reset email"))
    }

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

    // Send password reset confirmation email
    try {
        await emailService.sendEmail({
            to: email,
            subject: "Password Reset Successful",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Reset Successful</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your password has been successfully reset. If you didn't make this change, please contact our support team immediately.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/login" 
                           style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Login to Your Account
                        </a>
                    </div>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">This email was sent from our platform. Please do not reply to this email.</p>
                </div>
            `,
            text: `Hi ${user.name}, Your password has been successfully reset. If you didn't make this change, please contact our support team immediately.`
        });
    } catch (error) {
        console.error("Failed to send password reset confirmation email:", error);
        // Continue with password reset even if email fails
    }

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

    // Send password change confirmation email
    try {
        await emailService.sendEmail({
            to: user.email,
            subject: "Password Changed Successfully",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Password Changed Successfully</h2>
                    <p>Hi ${user.name},</p>
                    <p>Your password has been successfully changed. If you didn't make this change, please contact our support team immediately.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/login" 
                           style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            Login to Your Account
                        </a>
                    </div>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                    <p style="color: #666; font-size: 12px;">This email was sent from our platform. Please do not reply to this email.</p>
                </div>
            `,
            text: `Hi ${user.name}, Your password has been successfully changed. If you didn't make this change, please contact our support team immediately.`
        });
    } catch (error) {
        console.error("Failed to send password change confirmation email:", error);
        // Continue with password change even if email fails
    }

    return reply.code(200).send(new ApiResponse(200, {}, "Password changed successfully"))
})

// Get Current User
const getCurrentUser = asyncHandler(async (request, reply) => {
    let user = await User.findById(request.user._id)
        .populate("address")
        .populate("role_id", "name permissions")
        .populate("store_id", "name domain")
        .select("-password -refresh_token")
        .lean()

    const orders = await Order.find({ user_id: user._id }).populate("items.product_id", "name price slug")
    const cart = await Cart.find({ user_id: user._id })

    user.orders = orders
    user.cart = cart

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