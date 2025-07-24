import Redis from "ioredis"
import logger from "./logger.js"

class CacheService {
  constructor() {
    this.redis = null
    this.isConnected = false
    this.memoryCache = new Map()
    this.maxMemoryCacheSize = 1000
  }

  async connect() {
    try {
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          retryDelayOnFailover: 100,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        })

        this.redis.on("connect", () => {
          logger.info("Redis connected successfully")
          this.isConnected = true
        })

        this.redis.on("error", (error) => {
          logger.error("Redis connection error:", error)
          this.isConnected = false
        })

        this.redis.on("close", () => {
          logger.warn("Redis connection closed")
          this.isConnected = false
        })

        await this.redis.connect()
      } else {
        logger.info("Redis URL not provided, using memory cache only")
      }
    } catch (error) {
      logger.error("Failed to connect to Redis:", error)
      logger.info("Falling back to memory cache")
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      const serializedValue = JSON.stringify(value)

      if (this.redis && this.isConnected) {
        await this.redis.setex(key, ttl, serializedValue)
      } else {
        // Use memory cache as fallback
        this.setMemoryCache(key, { value: serializedValue, expires: Date.now() + ttl * 1000 })
      }

      logger.debug(`Cache set: ${key}`)
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error)
    }
  }

  async get(key) {
    try {
      let value = null

      if (this.redis && this.isConnected) {
        value = await this.redis.get(key)
      } else {
        // Use memory cache as fallback
        const cached = this.getMemoryCache(key)
        value = cached ? cached.value : null
      }

      if (value) {
        logger.debug(`Cache hit: ${key}`)
        return JSON.parse(value)
      }

      logger.debug(`Cache miss: ${key}`)
      return null
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error)
      return null
    }
  }

  async del(key) {
    try {
      if (this.redis && this.isConnected) {
        await this.redis.del(key)
      } else {
        this.memoryCache.delete(key)
      }

      logger.debug(`Cache deleted: ${key}`)
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error)
    }
  }

  async exists(key) {
    try {
      if (this.redis && this.isConnected) {
        return await this.redis.exists(key)
      } else {
        const cached = this.getMemoryCache(key)
        return cached !== null
      }
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error)
      return false
    }
  }

  async flush() {
    try {
      if (this.redis && this.isConnected) {
        await this.redis.flushall()
      } else {
        this.memoryCache.clear()
      }

      logger.info("Cache flushed")
    } catch (error) {
      logger.error("Cache flush error:", error)
    }
  }

  // Memory cache methods (fallback)
  setMemoryCache(key, data) {
    // Remove oldest entries if cache is full
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value
      this.memoryCache.delete(firstKey)
    }

    this.memoryCache.set(key, data)
  }

  getMemoryCache(key) {
    const cached = this.memoryCache.get(key)

    if (cached) {
      // Check if expired
      if (cached.expires && Date.now() > cached.expires) {
        this.memoryCache.delete(key)
        return null
      }
      return cached
    }

    return null
  }

  // Cache patterns for common operations
  async cacheUserSession(userId, sessionData, ttl = 86400) {
    // 24 hours
    await this.set(`user_session:${userId}`, sessionData, ttl)
  }

  async getUserSession(userId) {
    return await this.get(`user_session:${userId}`)
  }

  async clearUserSession(userId) {
    await this.del(`user_session:${userId}`)
  }

  async cacheProductData(productId, productData, ttl = 3600) {
    // 1 hour
    await this.set(`product:${productId}`, productData, ttl)
  }

  async getProductData(productId) {
    return await this.get(`product:${productId}`)
  }

  async cacheStoreData(storeId, storeData, ttl = 7200) {
    // 2 hours
    await this.set(`store:${storeId}`, storeData, ttl)
  }

  async getStoreData(storeId) {
    return await this.get(`store:${storeId}`)
  }

  // Rate limiting cache
  async incrementRateLimit(key, ttl = 900) {
    // 15 minutes
    try {
      if (this.redis && this.isConnected) {
        const current = await this.redis.incr(key)
        if (current === 1) {
          await this.redis.expire(key, ttl)
        }
        return current
      } else {
        // Memory cache implementation for rate limiting
        const cached = this.getMemoryCache(key)
        const count = cached ? JSON.parse(cached.value) + 1 : 1
        this.setMemoryCache(key, {
          value: JSON.stringify(count),
          expires: Date.now() + ttl * 1000,
        })
        return count
      }
    } catch (error) {
      logger.error(`Rate limit increment error for key ${key}:`, error)
      return 0
    }
  }

  async getRateLimit(key) {
    try {
      const value = await this.get(key)
      return value || 0
    } catch (error) {
      logger.error(`Rate limit get error for key ${key}:`, error)
      return 0
    }
  }

  async disconnect() {
    try {
      if (this.redis) {
        await this.redis.quit()
        logger.info("Redis connection closed")
      }
    } catch (error) {
      logger.error("Error closing Redis connection:", error)
    }
  }
}

export const cacheService = new CacheService()
