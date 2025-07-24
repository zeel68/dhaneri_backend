import multer from "multer"
import { CloudinaryStorage } from "multer-storage-cloudinary"
import { v2 as cloudinary } from "cloudinary"
import { ApiError } from "../utils/ApiError.js"

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "ecommerce-platform",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 1200, height: 1200, crop: "limit" }, { quality: "auto" }, { fetch_format: "auto" }],
  },
})

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith("image/")) {
    cb(null, true)
  } else {
    cb(new ApiError(400, "Only image files are allowed"), false)
  }
}

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10, // Maximum 10 files
  },
})

// Middleware for single file upload
export const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.single(fieldName)

    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File size too large. Maximum 5MB allowed."))
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return next(new ApiError(400, "Too many files. Maximum 10 files allowed."))
        }
        return next(new ApiError(400, `Upload error: ${err.message}`))
      } else if (err) {
        return next(err)
      }
      next()
    })
  }
}

// Middleware for multiple file upload
export const uploadMultiple = (fieldName, maxCount = 10) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.array(fieldName, maxCount)

    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File size too large. Maximum 5MB allowed."))
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return next(new ApiError(400, `Too many files. Maximum ${maxCount} files allowed.`))
        }
        return next(new ApiError(400, `Upload error: ${err.message}`))
      } else if (err) {
        return next(err)
      }
      next()
    })
  }
}

// Middleware for multiple fields
export const uploadFields = (fields) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.fields(fields)

    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new ApiError(400, "File size too large. Maximum 5MB allowed."))
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return next(new ApiError(400, "Too many files uploaded."))
        }
        return next(new ApiError(400, `Upload error: ${err.message}`))
      } else if (err) {
        return next(err)
      }
      next()
    })
  }
}

// Helper function to delete file from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId)
    return result
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error)
    throw new ApiError(500, "Failed to delete file from storage")
  }
}

// Helper function to get optimized image URL
export const getOptimizedImageUrl = (publicId, options = {}) => {
  const defaultOptions = {
    width: 800,
    height: 600,
    crop: "fill",
    quality: "auto",
    fetch_format: "auto",
  }

  const finalOptions = { ...defaultOptions, ...options }

  return cloudinary.url(publicId, finalOptions)
}

export { cloudinary }
