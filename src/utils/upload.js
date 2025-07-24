import multer from "multer"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { v2 as cloudinary } from "cloudinary"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Multer configuration for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

// File filter
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.fieldname === "images" || file.fieldname === "image" || file.fieldname === "avatar") {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"), false)
    }
  } else {
    cb(null, true)
  }
}

// Multer upload configuration
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 10, // Maximum 10 files
  },
  fileFilter: fileFilter,
})

// Upload to Cloudinary
export const uploadOnCloudinary = async (localFilePath, folder = "ecommerce") => {
  try {
    if (!localFilePath) return null

    // Upload file to Cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      resource_type: "auto",
      quality: "auto",
      fetch_format: "auto",
    })

    // Delete local file after successful upload
    fs.unlinkSync(localFilePath)

    return response
  } catch (error) {
    // Delete local file if upload fails
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath)
    }
    console.error("Cloudinary upload error:", error)
    return null
  }
}

// Delete from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId)
    return result
  } catch (error) {
    console.error("Cloudinary delete error:", error)
    return null
  }
}

// Upload multiple files
export const uploadMultipleFiles = async (files, folder = "ecommerce") => {
  const uploadPromises = files.map((file) => uploadOnCloudinary(file.path, folder))
  const results = await Promise.all(uploadPromises)
  return results.filter((result) => result !== null)
}

// Resize image before upload
export const resizeAndUpload = async (localFilePath, options = {}) => {
  try {
    const { width = 800, height = 600, quality = "auto", folder = "ecommerce" } = options

    const response = await cloudinary.uploader.upload(localFilePath, {
      folder: folder,
      transformation: [{ width, height, crop: "limit" }, { quality }],
    })

    // Delete local file
    fs.unlinkSync(localFilePath)

    return response
  } catch (error) {
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath)
    }
    console.error("Resize and upload error:", error)
    return null
  }
}

// Generate signed URL for secure uploads
export const generateSignedUploadUrl = (folder = "ecommerce") => {
  const timestamp = Math.round(new Date().getTime() / 1000)
  const params = {
    timestamp,
    folder,
    upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
  }

  return cloudinary.utils.cloudinary_url("", {
    sign_url: true,
    ...params,
  })
}
