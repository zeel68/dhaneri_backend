import axios from "axios"
import { cacheService } from "./cache.js"

// Get location information from IP address
export const getLocationFromIP = async (ipAddress) => {
  try {
    // Check cache first
    const cacheKey = `location:${ipAddress}`
    // const cachedLocation = await cacheService.get(cacheKey)

    // if (cachedLocation) {
    //   return cachedLocation
    // }

    // Skip for local/private IPs
    if (isPrivateIP(ipAddress)) {
      return {
        country: "Unknown",
        country_code: "XX",
        region: "Unknown",
        city: "Unknown",
        latitude: null,
        longitude: null,
        timezone: "UTC",
        isp: "Unknown",
      }
    }

    // Use ip-api.com (free tier)
    const response = await axios.get(`http://ip-api.com/json/${ipAddress}`, {
      timeout: 5000,
    })

    if (response.data.status === "success") {
      const locationData = {
        country: response.data.country,
        country_code: response.data.countryCode,
        region: response.data.regionName,
        city: response.data.city,
        latitude: response.data.lat,
        longitude: response.data.lon,
        timezone: response.data.timezone,
        isp: response.data.isp,
      }

      // Cache for 24 hours
      // await cacheService.set(cacheKey, locationData, 86400)

      return locationData
    }

    throw new Error("Location service failed")
  } catch (error) {
    console.error("Error getting location from IP:", error)

    // Return default location data
    return {
      country: "Unknown",
      country_code: "XX",
      region: "Unknown",
      city: "Unknown",
      latitude: null,
      longitude: null,
      timezone: "UTC",
      isp: "Unknown",
    }
  }
}

// Check if IP is private/local
const isPrivateIP = (ip) => {
  const privateRanges = [/^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^127\./, /^::1$/, /^localhost$/]

  return privateRanges.some((range) => range.test(ip))
}

// Parse User Agent for device information
export const parseUserAgent = (userAgent) => {
  const deviceType = /Mobile|Android|iPhone|iPad/.test(userAgent)
    ? /iPad/.test(userAgent)
      ? "tablet"
      : "mobile"
    : "desktop"

  let browser = "Unknown"
  let os = "Unknown"

  // Browser detection
  if (userAgent.includes("Chrome")) browser = "Chrome"
  else if (userAgent.includes("Firefox")) browser = "Firefox"
  else if (userAgent.includes("Safari")) browser = "Safari"
  else if (userAgent.includes("Edge")) browser = "Edge"

  // OS detection
  if (userAgent.includes("Windows")) os = "Windows"
  else if (userAgent.includes("Mac")) os = "macOS"
  else if (userAgent.includes("Linux")) os = "Linux"
  else if (userAgent.includes("Android")) os = "Android"
  else if (userAgent.includes("iOS")) os = "iOS"

  return { deviceType, browser, os }
}

// Parse referrer for traffic source
export const parseReferrer = (referrerUrl, utmParams = {}) => {
  if (!referrerUrl && !utmParams.utm_source) {
    return {
      source: "direct",
      medium: "none",
      campaign: null,
    }
  }

  // UTM parameters take precedence
  if (utmParams.utm_source) {
    return {
      source: utmParams.utm_source,
      medium: utmParams.utm_medium || "unknown",
      campaign: utmParams.utm_campaign,
    }
  }

  // Parse referrer URL
  try {
    const url = new URL(referrerUrl)
    const hostname = url.hostname.toLowerCase()

    let source = "referral"
    let medium = "referral"

    // Social media
    if (hostname.includes("facebook")) {
      source = "facebook"
      medium = "social"
    } else if (hostname.includes("twitter") || hostname.includes("t.co")) {
      source = "twitter"
      medium = "social"
    } else if (hostname.includes("instagram")) {
      source = "instagram"
      medium = "social"
    } else if (hostname.includes("linkedin")) {
      source = "linkedin"
      medium = "social"
    }
    // Search engines
    else if (hostname.includes("google")) {
      source = "google"
      medium = url.searchParams.get("gclid") ? "cpc" : "organic"
    } else if (hostname.includes("bing")) {
      source = "bing"
      medium = "organic"
    } else if (hostname.includes("yahoo")) {
      source = "yahoo"
      medium = "organic"
    }

    return { source, medium, campaign: null }
  } catch (error) {
    return {
      source: "referral",
      medium: "referral",
      campaign: null,
    }
  }
}
