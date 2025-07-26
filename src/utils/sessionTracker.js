/**
 * Frontend Session Tracker Utility
 * This utility helps frontend applications track user sessions and interactions
 */

class SessionTracker {
    constructor(apiBaseUrl, storeId, options = {}) {
        this.apiBaseUrl = apiBaseUrl
        this.storeId = storeId
        this.sessionId = this.generateSessionId()
        this.isActive = false
        this.heartbeatInterval = null
        this.pageStartTime = Date.now()

        // Configuration options
        this.options = {
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            trackScrollDepth: options.trackScrollDepth !== false,
            trackClicks: options.trackClicks !== false,
            trackFormSubmissions: options.trackFormSubmissions !== false,
            autoEndSession: options.autoEndSession !== false,
            ...options,
        }

        this.init()
    }

    generateSessionId() {
        return "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9)
    }

    async init() {
        try {
            // Get device and browser information
            const deviceInfo = this.getDeviceInfo()
            const utmParams = this.getUTMParams()

            // Start session tracking
            await this.startSession({
                session_id: this.sessionId,
                user_agent: navigator.userAgent,
                referrer: document.referrer,
                utm_params: utmParams,
                device_info: deviceInfo,
                screen_resolution: `${screen.width}x${screen.height}`,
            })

            this.isActive = true
            this.startHeartbeat()
            this.attachEventListeners()

            console.log("Session tracking initialized:", this.sessionId)
        } catch (error) {
            console.error("Failed to initialize session tracking:", error)
        }
    }

    getDeviceInfo() {
        const userAgent = navigator.userAgent
        let deviceType = "desktop"

        if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
            deviceType = "tablet"
        } else if (
            /mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)
        ) {
            deviceType = "mobile"
        }

        return {
            type: deviceType,
            browser: this.getBrowserName(),
            os: this.getOSName(),
        }
    }

    getBrowserName() {
        const userAgent = navigator.userAgent
        if (userAgent.includes("Chrome")) return "Chrome"
        if (userAgent.includes("Firefox")) return "Firefox"
        if (userAgent.includes("Safari")) return "Safari"
        if (userAgent.includes("Edge")) return "Edge"
        return "Unknown"
    }

    getOSName() {
        const userAgent = navigator.userAgent
        if (userAgent.includes("Windows")) return "Windows"
        if (userAgent.includes("Mac")) return "macOS"
        if (userAgent.includes("Linux")) return "Linux"
        if (userAgent.includes("Android")) return "Android"
        if (userAgent.includes("iOS")) return "iOS"
        return "Unknown"
    }

    getUTMParams() {
        const urlParams = new URLSearchParams(window.location.search)
        return {
            source: urlParams.get("utm_source"),
            medium: urlParams.get("utm_medium"),
            campaign: urlParams.get("utm_campaign"),
            term: urlParams.get("utm_term"),
            content: urlParams.get("utm_content"),
        }
    }

    async startSession(sessionData) {
        const response = await fetch(`${this.apiBaseUrl}/session/track/session/${this.storeId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(sessionData),
        })

        if (!response.ok) {
            throw new Error("Failed to start session tracking")
        }

        return response.json()
    }

    async trackProductView(productId, viewData = {}) {
        if (!this.isActive) return

        const data = {
            session_id: this.sessionId,
            view_duration: viewData.duration || 0,
            scroll_depth: viewData.scrollDepth || this.getScrollDepth(),
            interactions: viewData.interactions || [],
            referrer: document.referrer,
            page_title: document.title,
            device_type: this.getDeviceInfo().type,
            utm_params: this.getUTMParams(),
            ...viewData,
        }

        try {
            await fetch(`${this.apiBaseUrl}/session/track/product-view/${this.storeId}/${productId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            })
        } catch (error) {
            console.error("Failed to track product view:", error)
        }
    }

    async trackCartEvent(productId, action, eventData = {}) {
        if (!this.isActive) return

        const data = {
            session_id: this.sessionId,
            product_id: productId,
            action: action, // 'add', 'remove', 'update', 'abandon'
            quantity: eventData.quantity || 1,
            price: eventData.price || 0,
            variant_id: eventData.variantId,
            cart_total_before: eventData.cartTotalBefore || 0,
            cart_total_after: eventData.cartTotalAfter || 0,
            cart_items_count: eventData.cartItemsCount || 0,
            device_type: this.getDeviceInfo().type,
            utm_params: this.getUTMParams(),
            ...eventData,
        }

        try {
            await fetch(`${this.apiBaseUrl}/session/track/cart-event/${this.storeId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            })
        } catch (error) {
            console.error("Failed to track cart event:", error)
        }
    }

    async trackWishlistEvent(productId, action) {
        if (!this.isActive) return

        const data = {
            session_id: this.sessionId,
            product_id: productId,
            action: action, // 'add', 'remove'
            device_type: this.getDeviceInfo().type,
            utm_params: this.getUTMParams(),
        }

        try {
            const token = localStorage.getItem("authToken") // Adjust based on your auth implementation
            await fetch(`${this.apiBaseUrl}/session/track/wishlist-event/${this.storeId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(data),
            })
        } catch (error) {
            console.error("Failed to track wishlist event:", error)
        }
    }

    getScrollDepth() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight
        return documentHeight > 0 ? Math.round((scrollTop / documentHeight) * 100) : 0
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isActive) {
                this.sendHeartbeat()
            }
        }, this.options.heartbeatInterval)
    }

    async sendHeartbeat() {
        // This could be used to update session activity
        // For now, we'll just track page time
        const timeSpent = Math.floor((Date.now() - this.pageStartTime) / 1000)

        // You could send this data to update session activity
        console.log("Session heartbeat:", {
            sessionId: this.sessionId,
            timeSpent,
            scrollDepth: this.getScrollDepth(),
        })
    }

    attachEventListeners() {
        // Track page visibility changes
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this.pauseTracking()
            } else {
                this.resumeTracking()
            }
        })

        // Track page unload
        window.addEventListener("beforeunload", () => {
            this.endSession()
        })

        // Track clicks if enabled
        if (this.options.trackClicks) {
            document.addEventListener("click", (event) => {
                this.trackClick(event)
            })
        }

        // Track scroll depth if enabled
        if (this.options.trackScrollDepth) {
            let scrollTimeout
            window.addEventListener("scroll", () => {
                clearTimeout(scrollTimeout)
                scrollTimeout = setTimeout(() => {
                    const scrollDepth = this.getScrollDepth()
                    console.log("Scroll depth:", scrollDepth)
                }, 100)
            })
        }
    }

    trackClick(event) {
        const element = event.target
        const clickData = {
            element: element.tagName,
            text: element.textContent?.substring(0, 100),
            href: element.href,
            className: element.className,
            id: element.id,
            timestamp: new Date().toISOString(),
        }

        console.log("Click tracked:", clickData)
        // You could send this to your analytics endpoint
    }

    pauseTracking() {
        this.isActive = false
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
        }
    }

    resumeTracking() {
        this.isActive = true
        this.pageStartTime = Date.now()
        this.startHeartbeat()
    }

    async endSession() {
        if (!this.isActive) return

        const sessionDuration = Math.floor((Date.now() - this.pageStartTime) / 1000)

        try {
            await fetch(`${this.apiBaseUrl}/session/track/session/${this.sessionId}/end`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    session_duration: sessionDuration,
                    converted: false, // Set based on your conversion logic
                    conversion_value: 0,
                }),
            })
        } catch (error) {
            console.error("Failed to end session:", error)
        }

        this.pauseTracking()
    }

    // Convenience methods for common e-commerce events
    trackAddToCart(productId, quantity, price, variantId = null) {
        return this.trackCartEvent(productId, "add", {
            quantity,
            price,
            variantId,
        })
    }

    trackRemoveFromCart(productId, quantity, price) {
        return this.trackCartEvent(productId, "remove", {
            quantity,
            price,
        })
    }

    trackAddToWishlist(productId) {
        return this.trackWishlistEvent(productId, "add")
    }

    trackRemoveFromWishlist(productId) {
        return this.trackWishlistEvent(productId, "remove")
    }

    trackPurchase(orderData) {
        // Track purchase conversion
        console.log("Purchase tracked:", orderData)
        // Implement purchase tracking logic
    }
}

// Export for use in frontend applications
export default SessionTracker

// Usage example:
/*
// Initialize tracker
const tracker = new SessionTracker('https://api.yourstore.com/api/storefront', 'store_123');

// Track product view
tracker.trackProductView('product_456', {
  duration: 45,
  scrollDepth: 75
});

// Track add to cart
tracker.trackAddToCart('product_456', 2, 29.99);

// Track wishlist
tracker.trackAddToWishlist('product_456');
*/
