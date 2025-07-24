import crypto from "crypto"
import { ApiError } from "./ApiError.js"

// String utilities
export const capitalizeFirst = (str) => {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const capitalizeWords = (str) => {
  if (!str) return ""
  return str.split(" ").map(capitalizeFirst).join(" ")
}

export const slugify = (str) => {
  if (!str) return ""
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const truncate = (str, length = 100, suffix = "...") => {
  if (!str || str.length <= length) return str
  return str.substring(0, length).trim() + suffix
}

export const generateRandomString = (length = 10) => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
}

// Number utilities
export const formatCurrency = (amount, currency = "USD", locale = "en-US") => {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(amount)
}

export const formatNumber = (number, locale = "en-US") => {
  return new Intl.NumberFormat(locale).format(number)
}

export const roundToDecimals = (number, decimals = 2) => {
  return Math.round(number * Math.pow(10, decimals)) / Math.pow(10, decimals)
}

export const generateOrderNumber = () => {
  const timestamp = Date.now().toString()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `ORD-${timestamp.slice(-6)}${random}`
}

export const generateSKU = (productName, category) => {
  const nameCode = productName.substring(0, 3).toUpperCase()
  const categoryCode = category.substring(0, 2).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${categoryCode}-${nameCode}-${random}`
}

// Date utilities
export const formatDate = (date, locale = "en-US", options = {}) => {
  const defaultOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  }
  return new Date(date).toLocaleDateString(locale, { ...defaultOptions, ...options })
}

export const formatDateTime = (date, locale = "en-US") => {
  return new Date(date).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export const isDateExpired = (date) => {
  return new Date(date) < new Date()
}

export const getDateRange = (period) => {
  const now = new Date()
  const startDate = new Date()

  switch (period) {
    case "today":
      startDate.setHours(0, 0, 0, 0)
      break
    case "week":
      startDate.setDate(now.getDate() - 7)
      break
    case "month":
      startDate.setMonth(now.getMonth() - 1)
      break
    case "quarter":
      startDate.setMonth(now.getMonth() - 3)
      break
    case "year":
      startDate.setFullYear(now.getFullYear() - 1)
      break
    default:
      startDate.setDate(now.getDate() - 30)
  }

  return { startDate, endDate: now }
}

// Array utilities
export const paginate = (array, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit
  const endIndex = startIndex + limit

  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      page,
      limit,
      total: array.length,
      pages: Math.ceil(array.length / limit),
      hasNext: endIndex < array.length,
      hasPrev: startIndex > 0,
    },
  }
}

export const groupBy = (array, key) => {
  return array.reduce((groups, item) => {
    const group = item[key]
    groups[group] = groups[group] || []
    groups[group].push(item)
    return groups
  }, {})
}

export const sortBy = (array, key, direction = "asc") => {
  return array.sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]

    if (direction === "desc") {
      return bVal > aVal ? 1 : -1
    }
    return aVal > bVal ? 1 : -1
  })
}

export const removeDuplicates = (array, key) => {
  if (!key) return [...new Set(array)]

  const seen = new Set()
  return array.filter((item) => {
    const value = item[key]
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

// Object utilities
export const pick = (obj, keys) => {
  const result = {}
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key]
    }
  })
  return result
}

export const omit = (obj, keys) => {
  const result = { ...obj }
  keys.forEach((key) => {
    delete result[key]
  })
  return result
}

export const isEmpty = (value) => {
  if (value == null) return true
  if (Array.isArray(value) || typeof value === "string") return value.length === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return false
}

export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj))
}

// Validation utilities
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/
  return phoneRegex.test(phone)
}

export const isValidUrl = (url) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export const isValidObjectId = (id) => {
  const objectIdRegex = /^[0-9a-fA-F]{24}$/
  return objectIdRegex.test(id)
}

// Password utilities
export const generatePassword = (length = 12) => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password
}

export const checkPasswordStrength = (password) => {
  const minLength = 8
  const hasUpperCase = /[A-Z]/.test(password)
  const hasLowerCase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password)

  let score = 0
  const feedback = []

  if (password.length >= minLength) score++
  else feedback.push("At least 8 characters")

  if (hasUpperCase) score++
  else feedback.push("At least one uppercase letter")

  if (hasLowerCase) score++
  else feedback.push("At least one lowercase letter")

  if (hasNumbers) score++
  else feedback.push("At least one number")

  if (hasSpecialChar) score++
  else feedback.push("At least one special character")

  const strength = score < 3 ? "weak" : score < 5 ? "medium" : "strong"

  return {
    score,
    strength,
    feedback,
    isValid: score >= 4,
  }
}

// File utilities
export const getFileExtension = (filename) => {
  return filename.split(".").pop().toLowerCase()
}

export const isImageFile = (filename) => {
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg"]
  return imageExtensions.includes(getFileExtension(filename))
}

export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

// Error handling utilities
export const handleAsyncError = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export const createError = (statusCode, message, details = {}) => {
  return new ApiError(statusCode, message, details)
}

// Search utilities
export const createSearchRegex = (query) => {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(escapedQuery, "i")
}

export const highlightSearchTerm = (text, searchTerm) => {
  if (!searchTerm) return text
  const regex = new RegExp(`(${searchTerm})`, "gi")
  return text.replace(regex, "<mark>$1</mark>")
}

// Analytics utilities
export const calculatePercentageChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

export const calculateAverage = (numbers) => {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length
}

export const calculateMedian = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

// Export all utilities as default object
export default {
  // String utilities
  capitalizeFirst,
  capitalizeWords,
  slugify,
  truncate,
  generateRandomString,

  // Number utilities
  formatCurrency,
  formatNumber,
  roundToDecimals,
  generateOrderNumber,
  generateSKU,

  // Date utilities
  formatDate,
  formatDateTime,
  addDays,
  isDateExpired,
  getDateRange,

  // Array utilities
  paginate,
  groupBy,
  sortBy,
  removeDuplicates,

  // Object utilities
  pick,
  omit,
  isEmpty,
  deepClone,

  // Validation utilities
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isValidObjectId,

  // Password utilities
  generatePassword,
  checkPasswordStrength,

  // File utilities
  getFileExtension,
  isImageFile,
  formatFileSize,

  // Error handling utilities
  handleAsyncError,
  createError,

  // Search utilities
  createSearchRegex,
  highlightSearchTerm,

  // Analytics utilities
  calculatePercentageChange,
  calculateAverage,
  calculateMedian,
}
