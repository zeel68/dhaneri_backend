// middleware/rateLimiter.middleware.js

export const generalLimiter = {
  max: 1000000,
  timeWindow: '15 minutes',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many requests from this IP, please try again later.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const authLimiter = {
  max: 50000,
  timeWindow: '15 minutes',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const strictLimiter = {
  max: 2000,
  timeWindow: '15 minutes',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Rate limit exceeded for this endpoint.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const uploadLimiter = {
  max: 5000,
  timeWindow: '1 hour',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many file uploads, please try again later.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const passwordResetLimiter = {
  max: 3,
  timeWindow: '1 hour',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many password reset attempts, please try again after 1 hour.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const emailVerificationLimiter = {
  max: 5,
  timeWindow: '1 hour',
  keyGenerator: (req) => req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
  errorResponseBuilder: () => ({
    success: false,
    message: "Too many email verification requests, please try again later.",
    statusCode: 429,
  }),
  skipOnError: false,
}

export const apiKeyLimiter = {
  max: 10000,
  timeWindow: '1 hour',
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  errorResponseBuilder: () => ({
    success: false,
    message: "API rate limit exceeded.",
    statusCode: 429,
  }),
  skipOnError: false,
}
