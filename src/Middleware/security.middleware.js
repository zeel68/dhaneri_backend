import helmet from "helmet"
import cors from "cors"
import { ApiError } from "../utils/ApiError.js"

// Security headers configuration
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://images.unsplash.com"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}

// CORS configuration
// export const corsOptions = {
//   // origin: (origin, callback) => {
//   //   // Allow requests with no origin (like mobile apps or curl requests)
//   //   if (!origin) return callback(null, true)

//   //   const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
//   //     "http://localhost:3000",
//   //     "http://localhost:3001",
//   //     "http://localhost:5173",
//   //     "http://localhost:5174", "*"
//   //   ]

//   //   if (allowedOrigins.indexOf(origin) !== -1) {
//   //     callback(null, true)
//   //   } else {
//   //     callback(new ApiError(403, "Not allowed by CORS"))
//   //   }
//   // },
//   origin: true,
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
//   allowedHeaders: [
//     "Origin",
//     "X-Requested-With",
//     "Content-Type",
//     "Accept",
//     "Authorization",
//     "X-API-Key",
//     "X-Store-Domain",
//   ],
//   exposedHeaders: ["X-Total-Count", "X-Page-Count"],
// }

export const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "X-API-Key",
    "X-Store-Domain",
  ],
  exposedHeaders: ["X-Total-Count", "X-Page-Count"],
}


// Apply security middleware
export const applySecurity = (app) => {
  // Apply CORS
  app.use(cors(corsOptions))

  // Apply Helmet for security headers
  app.use(helmet(helmetOptions))

  // Custom security headers
  app.use((req, res, next) => {
    // Remove server information
    res.removeHeader("X-Powered-By")

    // Add custom security headers
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-XSS-Protection", "1; mode=block")
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")

    // Add cache control for API responses
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      res.setHeader("Pragma", "no-cache")
      res.setHeader("Expires", "0")
    }

    next()
  })
}

// IP whitelist middleware (for admin endpoints)
export const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (process.env.NODE_ENV === "development") {
      return next()
    }

    const clientIP = req.ip || req.connection.remoteAddress

    if (allowedIPs.length > 0 && !allowedIPs.includes(clientIP)) {
      throw new ApiError(403, "Access denied from this IP address")
    }

    next()
  }
}

// Request sanitization middleware
export const sanitizeRequest = (req, res, next) => {
  // Remove null bytes
  const sanitizeString = (str) => {
    if (typeof str === "string") {
      return str.replace(/\0/g, "")
    }
    return str
  }

  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === "object") {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === "string") {
            obj[key] = sanitizeString(obj[key])
          } else if (typeof obj[key] === "object") {
            sanitizeObject(obj[key])
          }
        }
      }
    }
  }

  // Sanitize request body, query, and params
  sanitizeObject(req.body)
  sanitizeObject(req.query)
  sanitizeObject(req.params)

  next()
}

// API key validation middleware
export const validateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"]

  if (!apiKey) {
    throw new ApiError(401, "API key is required")
  }

  // Validate API key format
  if (!apiKey.startsWith("pk_") || apiKey.length !== 67) {
    throw new ApiError(401, "Invalid API key format")
  }

  // Here you would typically validate against your database
  // For now, we'll just check if it's not empty
  next()
}

// Store domain validation middleware
export const validateStoreDomain = (req, res, next) => {
  const storeDomain = req.headers["x-store-domain"]

  if (!storeDomain) {
    throw new ApiError(400, "Store domain is required")
  }

  // Validate domain format
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/
  if (!domainRegex.test(storeDomain)) {
    throw new ApiError(400, "Invalid store domain format")
  }

  req.storeDomain = storeDomain
  next()
}
