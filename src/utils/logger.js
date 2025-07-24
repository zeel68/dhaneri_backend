import winston from "winston"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"
import fp from "fastify-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Setup logs directory
const logsDir = path.join(__dirname, "../logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Define log levels & colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
}
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
}
winston.addColors(colors)

// Define log format
const format = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
    ),
)

// Create Winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  levels,
  format,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    }),
  ],
  exitOnError: false,
})

// Extend logger with helper methods
logger.stream = {
  write: (message) => {
    logger.http(message.trim())
  },
}

logger.logError = (error, req = null) => {
  const errorInfo = {
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode || 500,
  }

  if (req) {
    errorInfo.request = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      ip: req.ip,
      userAgent: req.headers["user-agent"] || req.get?.("User-Agent"),
    }
  }

  logger.error(JSON.stringify(errorInfo, null, 2))
}

logger.logActivity = (action, userId, details = {}) => {
  logger.info(`User Activity: ${action}`, {
    userId,
    action,
    details,
    timestamp: new Date().toISOString(),
  })
}

logger.logSecurity = (event, details = {}) => {
  logger.warn(`Security Event: ${event}`, {
    event,
    details,
    timestamp: new Date().toISOString(),
  })
}

logger.logPerformance = (operation, duration, details = {}) => {
  logger.info(`Performance: ${operation} took ${duration}ms`, {
    operation,
    duration,
    details,
    timestamp: new Date().toISOString(),
  })
}

// Fastify plugin wrapper
async function loggerPlugin(fastify, options) {
  // Decorate Fastify instance with logger
  fastify.decorate("logger", logger)

  // Add request logging hook
  fastify.addHook("onRequest", (request, reply, done) => {
    request.startTime = Date.now()
    done()
  })

  fastify.addHook("onSend", (request, reply, payload, done) => {
    const duration = Date.now() - request.startTime

    logger.http("HTTP Request", {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userAgent: request.headers["user-agent"],
      userId: request.user?.id || null,
    })

    done()
  })
}

export default fp(loggerPlugin)
