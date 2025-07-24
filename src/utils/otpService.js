import crypto from "crypto"
import { ApiError } from "./ApiError.js"

class OTPService {
  // Generate a 6-digit OTP
  generateOTP() {
    return crypto.randomInt(100000, 999999).toString()
  }

  // Generate a secure random token
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString("hex")
  }

  // Create OTP with expiration (default 10 minutes)
  createOTPWithExpiry(expiryMinutes = 10) {
    const otp = this.generateOTP()
    const expires = new Date(Date.now() + expiryMinutes * 60 * 1000)

    return {
      otp,
      expires,
    }
  }

  // Verify OTP
  verifyOTP(providedOTP, storedOTP, expiryDate) {
    if (!providedOTP || !storedOTP) {
      throw new ApiError(400, "OTP is required")
    }

    if (new Date() > new Date(expiryDate)) {
      throw new ApiError(400, "OTP has expired")
    }

    if (providedOTP !== storedOTP) {
      throw new ApiError(400, "Invalid OTP")
    }

    return true
  }

  // Generate password reset token with expiry (default 1 hour)
  createPasswordResetToken(expiryHours = 1) {
    const token = this.generateToken()
    const expires = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

    return {
      token,
      expires,
    }
  }

  // Hash token for storage (for password reset tokens)
  hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex")
  }

  // Generate email verification token
  createEmailVerificationToken() {
    return this.generateToken(64)
  }

  // Create a secure session token
  createSessionToken() {
    return this.generateToken(48)
  }

  // Generate API key
  generateAPIKey() {
    const prefix = "pk_"
    const key = this.generateToken(32)
    return prefix + key
  }

  // Validate token format
  isValidTokenFormat(token, expectedLength = 64) {
    if (!token || typeof token !== "string") {
      return false
    }

    // Check if it's a valid hex string of expected length
    const hexRegex = new RegExp(`^[a-f0-9]{${expectedLength}}$`, "i")
    return hexRegex.test(token)
  }

  // Generate backup codes for 2FA
  generateBackupCodes(count = 8) {
    const codes = []
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = crypto.randomBytes(4).toString("hex").toUpperCase()
      codes.push(code)
    }
    return codes
  }

  // Generate TOTP secret for 2FA
  generateTOTPSecret() {
    return crypto.randomBytes(20).toString("base32")
  }
}

export const otpService = new OTPService()
