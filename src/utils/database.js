import mongoose from "mongoose"
import logger from "./logger.js"

export class DatabaseService {
  constructor() {
    this.isConnected = false
    this.connectionAttempts = 0
    this.maxRetries = 5
    this.retryDelay = 5000 // 5 seconds
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.info("Database already connected")
        return
      }

      const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL

      if (!mongoUri) {
        throw new Error("MongoDB connection string not provided")
      }

      // Connection options
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        family: 4, // Use IPv4, skip trying IPv6
        bufferCommands: false, // Disable mongoose buffering
        bufferMaxEntries: 0, // Disable mongoose buffering
      }

      await mongoose.connect(mongoUri, options)

      this.isConnected = true
      this.connectionAttempts = 0

      logger.info("Database connected successfully")

      // Set up connection event listeners
      this.setupEventListeners()
    } catch (error) {
      this.connectionAttempts++
      logger.error(`Database connection failed (attempt ${this.connectionAttempts}):`, error.message)

      if (this.connectionAttempts < this.maxRetries) {
        logger.info(`Retrying database connection in ${this.retryDelay / 1000} seconds...`)
        setTimeout(() => this.connect(), this.retryDelay)
      } else {
        logger.error("Max database connection attempts reached. Exiting...")
        process.exit(1)
      }
    }
  }

  setupEventListeners() {
    mongoose.connection.on("connected", () => {
      logger.info("Mongoose connected to MongoDB")
      this.isConnected = true
    })

    mongoose.connection.on("error", (error) => {
      logger.error("Mongoose connection error:", error)
      this.isConnected = false
    })

    mongoose.connection.on("disconnected", () => {
      logger.warn("Mongoose disconnected from MongoDB")
      this.isConnected = false
    })

    // Handle application termination
    process.on("SIGINT", async () => {
      await this.disconnect()
      process.exit(0)
    })

    process.on("SIGTERM", async () => {
      await this.disconnect()
      process.exit(0)
    })
  }

  async disconnect() {
    try {
      await mongoose.connection.close()
      this.isConnected = false
      logger.info("Database connection closed")
    } catch (error) {
      logger.error("Error closing database connection:", error)
    }
  }

  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: "disconnected", message: "Database not connected" }
      }

      // Ping the database
      await mongoose.connection.db.admin().ping()

      const stats = await mongoose.connection.db.stats()

      return {
        status: "connected",
        message: "Database is healthy",
        details: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          name: mongoose.connection.name,
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize,
        },
      }
    } catch (error) {
      logger.error("Database health check failed:", error)
      return {
        status: "error",
        message: "Database health check failed",
        error: error.message,
      }
    }
  }

  async getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
    }
  }

  // Database maintenance operations
  async createIndexes() {
    try {
      logger.info("Creating database indexes...")

      // You can add custom index creation logic here
      // For example:
      // await User.createIndexes();
      // await Product.createIndexes();

      logger.info("Database indexes created successfully")
    } catch (error) {
      logger.error("Error creating database indexes:", error)
      throw error
    }
  }

  async dropDatabase() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cannot drop database in production environment")
    }

    try {
      await mongoose.connection.db.dropDatabase()
      logger.info("Database dropped successfully")
    } catch (error) {
      logger.error("Error dropping database:", error)
      throw error
    }
  }
}

export const databaseService = new DatabaseService()
