import Joi from "joi"
import { ApiError } from "../utils/ApiError.js"

// Common validation schemas
export const commonSchemas = {
  objectId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .message("Invalid ID format"),
  email: Joi.string().email().lowercase().trim(),
  password: Joi.string().min(6).max(128),
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .message("Invalid phone number format"),
  url: Joi.string().uri(),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  },
}

// User validation schemas
export const userValidation = {
  register: Joi.object({
    name: Joi.string().min(2).max(100).trim().required(),
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    phone_number: commonSchemas.phone.required(),
    role_id: commonSchemas.objectId,
    store_id: commonSchemas.objectId,
  }),

  login: Joi.object({
    email: commonSchemas.email,
    phone_number: commonSchemas.phone,
    password: Joi.string().required(),
    isGoogleLogin: Joi.boolean().default(false),
    name: Joi.string().when("isGoogleLogin", {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    profile_url: commonSchemas.url,
  }).xor("email", "phone_number"),

  updateProfile: Joi.object({
    name: Joi.string().min(2).max(100).trim(),
    phone_number: commonSchemas.phone,
    profile_url: commonSchemas.url,
    address: Joi.string().max(500).trim(),
  }),

  changePassword: Joi.object({
    oldPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required(),
  }),
}

// Store validation schemas
export const storeValidation = {
  create: Joi.object({
    store_name: Joi.string().min(2).max(100).trim().required(),
    domain: Joi.string().hostname().required(),
    category_id: commonSchemas.objectId.required(),
    admin_email: commonSchemas.email.required(),
    admin_password: commonSchemas.password.required(),
    admin_name: Joi.string().min(2).max(100).trim().required(),
    admin_phone: commonSchemas.phone,
    description: Joi.string().max(500).trim(),
  }),

  update: Joi.object({
    store_name: Joi.string().min(2).max(100).trim(),
    description: Joi.string().max(500).trim(),
    config: Joi.object({
      theme: Joi.string().valid("default", "modern", "classic", "minimal"),
      currency: Joi.string().length(3).uppercase(),
      enabledFeatures: Joi.array().items(Joi.string()),
    }),
  }),

  toggleStatus: Joi.object({
    is_active: Joi.boolean().required(),
  }),
}

// Product validation schemas
export const productValidation = {
  create: Joi.object({
    name: Joi.string().min(2).max(200).trim().required(),
    description: Joi.string().max(2000).trim().required(),
    price: Joi.number().positive().precision(2).required(),
    category_id: commonSchemas.objectId.required(),
    brand: Joi.string().max(100).trim(),
    sku: Joi.string().max(100).trim(),
    stock_quantity: Joi.number().integer().min(0).default(0),
    images: Joi.array().items(commonSchemas.url).max(10),
    specifications: Joi.object(),
    tags: Joi.array().items(Joi.string().trim()).max(20),
    is_active: Joi.boolean().default(true),
  }),

  update: Joi.object({
    name: Joi.string().min(2).max(200).trim(),
    description: Joi.string().max(2000).trim(),
    price: Joi.number().positive().precision(2),
    category_id: commonSchemas.objectId,
    brand: Joi.string().max(100).trim(),
    sku: Joi.string().max(100).trim(),
    stock_quantity: Joi.number().integer().min(0),
    images: Joi.array().items(commonSchemas.url).max(10),
    specifications: Joi.object(),
    tags: Joi.array().items(Joi.string().trim()).max(20),
    is_active: Joi.boolean(),
  }),

  query: Joi.object({
    ...commonSchemas.pagination,
    category_id: commonSchemas.objectId,
    min_price: Joi.number().positive(),
    max_price: Joi.number().positive(),
    brand: Joi.string().trim(),
    search: Joi.string().trim().max(100),
    sort: Joi.string().valid("price_asc", "price_desc", "name_asc", "name_desc", "created_desc"),
    is_active: Joi.boolean(),
  }),
}

// Order validation schemas
export const orderValidation = {
  create: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          product_id: commonSchemas.objectId.required(),
          quantity: Joi.number().integer().min(1).required(),
          price: Joi.number().positive().precision(2).required(),
        }),
      )
      .min(1)
      .required(),
    shipping_address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      postal_code: Joi.string().required(),
      country: Joi.string().required(),
    }).required(),
    payment_method: Joi.string().valid("card", "paypal", "bank_transfer").required(),
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid("pending", "confirmed", "processing", "shipped", "delivered", "cancelled").required(),
  }),
}

// Category validation schemas
export const categoryValidation = {
  create: Joi.object({
    category_name: Joi.string().min(2).max(100).trim().required(),
    img_url: commonSchemas.url,
    description: Joi.string().max(500).trim(),
  }),

  update: Joi.object({
    category_name: Joi.string().min(2).max(100).trim(),
    img_url: commonSchemas.url,
    description: Joi.string().max(500).trim(),
  }),
}

// Generic validation middleware
export const validate = (schema, property = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    })

    if (error) {
      const errorMessage = error.details.map((detail) => detail.message).join(", ")
      return next(new ApiError(400, `Validation error: ${errorMessage}`))
    }

    req[property] = value
    next()
  }
}

// Validate query parameters
export const validateQuery = (schema) => validate(schema, "query")

// Validate request parameters
export const validateParams = (schema) => validate(schema, "params")

// Common parameter validation
export const validateObjectId = (paramName = "id") => {
  const schema = Joi.object({
    [paramName]: commonSchemas.objectId.required(),
  })
  return validateParams(schema)
}

// Pagination validation
export const validatePagination = validateQuery(Joi.object(commonSchemas.pagination))
