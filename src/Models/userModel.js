import mongoose from "mongoose"
const { Schema } = mongoose
import validator from "validator"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// User Schema
const userSchema = new Schema(
    {
        store_id: {
            type: Schema.Types.ObjectId,
            ref: "Store",
        },
        name: {
            type: String,
            required: [true, "User name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: [true, "Email already exists"],
            index: true,
            trim: true,
            lowercase: true,
            validate: {
                validator: (value) => validator.isEmail(value),
                message: "Please provide a valid email address",
            },
        },
        phone_number: {
            type: String,
            required: [true, "Phone number is required"],
            unique: [true, "Phone number already exists"],
            index: true,
            trim: true,
            minlength: [10, "Phone number must be at least 10 characters"],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false,
        },
        email_verified: {
            type: Boolean,
            default: false,
        },
        phone_verified: {
            type: Boolean,
            default: false,
        },
        email_verification_otp: {
            type: String,
            select: false,
        },
        email_verification_expires: {
            type: Date,
            select: false,
        },
        password_reset_otp: {
            type: String,
            select: false,
        },
        password_reset_expires: {
            type: Date,
            select: false,
        },
        last_login: {
            type: Date,
            default: null,
        },
        role_id: {
            type: Schema.Types.ObjectId,
            ref: "Role",
            default: "6861734f5f118d3ee1451327",
            required: [true, "Role reference is required"],
        },
        profile_url: {
            type: String,
            trim: true,
            validate: {
                validator: (value) => {
                    if (!value) return true
                    return validator.isURL(value, {
                        protocols: ["http", "https"],
                        require_protocol: true,
                    })
                },
                message: "Profile URL must be a valid HTTP/HTTPS URL",
            },
        },
        provider: {
            type: String,
            enum: ["local", "google", "facebook", "apple"],
            default: "local",
        },
        provider_id: {
            type: String,
        },
        address: {
            type: String,
            trim: true,
            maxlength: [500, "Address cannot exceed 500 characters"],
        },
        is_active: {
            type: Boolean,
            default: true,
        },
        refresh_token: {
            type: String,
            select: false
        },
        cart: {
            type: Schema.Types.ObjectId,
            ref: "Cart",
        },
        wishlist: [
            {
                product_id: {
                    type: Schema.Types.ObjectId,
                    ref: "Product",
                },
                store_id: {
                    type: Schema.Types.ObjectId,
                    ref: "Store",
                },
                added_at: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        preferences: {
            notifications: {
                email: { type: Boolean, default: true },
                sms: { type: Boolean, default: false },
                push: { type: Boolean, default: true },
            },
            language: { type: String, default: "en" },
            currency: { type: String, default: "USD" },
            timezone: { type: String, default: "UTC" },
        },
        login_attempts: {
            count: { type: Number, default: 0 },
            last_attempt: Date,
            locked_until: Date,
        },
        two_factor: {
            enabled: { type: Boolean, default: false },
            secret: { type: String, select: false },
            backup_codes: [{ type: String, select: false }],
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
        versionKey: false,
        toJSON: {
            virtuals: true,
            transform: (doc, ret, options) => {
                delete ret.password
                if (!options.includeRefreshToken) {
                    delete ret.refresh_token
                }
                delete ret.email_verification_otp
                delete ret.password_reset_otp
                delete ret.two_factor
                return ret
            }

        },
        toObject: {
            virtuals: true,
            transform: (doc, ret, options) => {
                delete ret.password
                if (!options.includeRefreshToken) {
                    delete ret.refresh_token
                }
                delete ret.email_verification_otp
                delete ret.password_reset_otp
                delete ret.two_factor
                return ret
            }

        },
    },
)

// Virtual for user's role name
userSchema.virtual("role_name", {
    ref: "Role",
    localField: "role_id",
    foreignField: "_id",
    justOne: true,
    options: { select: "name" },
})

// Virtual for store details
userSchema.virtual("store_details", {
    ref: "Store",
    localField: "store_id",
    foreignField: "_id",
    justOne: true,
})

// Indexes
// userSchema.index({ email: 1 }, { unique: true })
// userSchema.index({ phone_number: 1 }, { unique: true })
userSchema.index({ role_id: 1 })
userSchema.index({ store_id: 1 })
userSchema.index({ is_active: 1 })
userSchema.index({ created_at: -1 })

// Pre-save middleware for role validation
userSchema.pre("validate", async function (next) {
    try {
        const role = await mongoose.model("Role").findById(this.role_id)
        if (!role) {
            return next(new Error("Invalid role_id"))
        }

        if (role.name !== "super_admin" && !this.store_id) {
            return next(new Error("store_id is required for non-superadmin users"))
        }
        next()
    } catch (err) {
        next(err)
    }
})

// Pre-save middleware for password hashing
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next()
    this.password = await bcrypt.hash(this.password, 12)
    next()
})

// Pre-save middleware for store validation
userSchema.pre("save", async function (next) {
    try {
        if (this.isModified("role_id")) {
            const roleExists = await mongoose.model("Role").exists({ _id: this.role_id })
            if (!roleExists) {
                throw new Error("Specified role does not exist")
            }
        }
        if (this.isModified("store_id") && this.store_id) {
            const storeExists = await mongoose.model("Store").exists({ _id: this.store_id })
            if (!storeExists) {
                throw new Error("Specified store does not exist")
            }
        }
        next()
    } catch (err) {
        next(err)
    }
})

// Instance methods
userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            name: this.name,
            role_id: this.role_id,
            store_id: this.store_id,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
        },
    )
}

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
        },
    )
}

userSchema.methods.isAccountLocked = function () {
    return !!(this.login_attempts.locked_until && this.login_attempts.locked_until > Date.now())
}

userSchema.methods.incrementLoginAttempts = function () {
    // If we have a previous lock that has expired, restart at 1
    if (this.login_attempts.locked_until && this.login_attempts.locked_until < Date.now()) {
        return this.updateOne({
            $unset: { "login_attempts.locked_until": 1 },
            $set: {
                "login_attempts.count": 1,
                "login_attempts.last_attempt": Date.now(),
            },
        })
    }

    const updates = {
        $inc: { "login_attempts.count": 1 },
        $set: { "login_attempts.last_attempt": Date.now() },
    }

    // Lock account after 5 failed attempts for 2 hours
    if (this.login_attempts.count + 1 >= 5 && !this.isAccountLocked()) {
        updates.$set["login_attempts.locked_until"] = Date.now() + 2 * 60 * 60 * 1000
    }

    return this.updateOne(updates)
}

userSchema.methods.resetLoginAttempts = function () {
    return this.updateOne({
        $unset: {
            "login_attempts.count": 1,
            "login_attempts.last_attempt": 1,
            "login_attempts.locked_until": 1,
        },
    })
}

// Static methods
userSchema.statics.validateRegistration = function (userData) {
    return new Promise((resolve, reject) => {
        const user = new this(userData)
        user.validate((err) => {
            if (err) {
                const errors = {}
                Object.keys(err.errors).forEach((key) => {
                    errors[key] = err.errors[key].message
                })
                reject({ errors, message: "User validation failed" })
            } else {
                resolve(user)
            }
        })
    })
}

userSchema.statics.findByEmailOrPhone = function (identifier) {
    return this.findOne({
        $or: [{ email: identifier }, { phone_number: identifier }],
    })
}

export const User = mongoose.model("User", userSchema)
