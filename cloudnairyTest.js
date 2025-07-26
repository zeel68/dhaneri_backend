import { v2 as cloudinary } from "cloudinary"

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Test Cloudinary connection and configuration
export const testCloudinarySetup = async () => {
    console.log("🧪 Testing Cloudinary Setup...")

    try {
        // Check environment variables
        const requiredEnvVars = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]

        const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

        if (missingVars.length > 0) {
            console.error("❌ Missing Cloudinary environment variables:", missingVars)
            return false
        }

        console.log("✅ Environment variables found")
        console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`)
        console.log(`   API Key: ${process.env.CLOUDINARY_API_KEY?.substring(0, 8)}...`)

        // Test API connection
        const pingResult = await cloudinary.api.ping()
        console.log("✅ Cloudinary API connection successful:", pingResult)

        // Test upload capabilities
        console.log("🧪 Testing upload capabilities...")

        // Create a simple test image (1x1 pixel base64)
        const testImageBase64 =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

        const uploadResult = await cloudinary.uploader.upload(testImageBase64, {
            folder: "ecommerce-platform/test",
            public_id: `test-${Date.now()}`,
            resource_type: "image",
        })

        console.log("✅ Test upload successful:")
        console.log(`   Public ID: ${uploadResult.public_id}`)
        console.log(`   URL: ${uploadResult.secure_url}`)
        console.log(`   Format: ${uploadResult.format}`)
        console.log(`   Size: ${uploadResult.bytes} bytes`)

        // Test delete capabilities
        const deleteResult = await cloudinary.uploader.destroy(uploadResult.public_id)
        console.log("✅ Test delete successful:", deleteResult)

        // Test transformation capabilities
        const transformedUrl = cloudinary.url("sample", {
            width: 300,
            height: 200,
            crop: "fill",
            quality: "auto",
            fetch_format: "auto",
        })
        console.log("✅ Transformation URL generated:", transformedUrl)

        console.log("🎉 All Cloudinary tests passed!")
        return true
    } catch (error) {
        console.error("❌ Cloudinary test failed:", error)

        if (error.http_code === 401) {
            console.error("   → Check your API credentials")
        } else if (error.http_code === 403) {
            console.error("   → Check your account permissions")
        } else if (error.http_code === 404) {
            console.error("   → Check your cloud name")
        }

        return false
    }
}

// Test specific upload scenarios
export const testUploadScenarios = async () => {
    console.log("🧪 Testing various upload scenarios...")

    const scenarios = [
        {
            name: "Product Image",
            folder: "ecommerce-platform/products",
            transformation: [{ width: 800, height: 600, crop: "fill" }, { quality: "auto" }],
        },
        {
            name: "User Avatar",
            folder: "ecommerce-platform/users",
            transformation: [
                { width: 150, height: 150, crop: "fill", gravity: "face" },
                { quality: "auto", fetch_format: "auto" },
            ],
        },
        {
            name: "Store Banner",
            folder: "ecommerce-platform/stores",
            transformation: [{ width: 1200, height: 400, crop: "fill" }, { quality: "auto" }],
        },
    ]

    const testImageBase64 =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

    for (const scenario of scenarios) {
        try {
            console.log(`   Testing ${scenario.name}...`)

            const result = await cloudinary.uploader.upload(testImageBase64, {
                folder: scenario.folder,
                public_id: `test-${scenario.name.toLowerCase().replace(" ", "-")}-${Date.now()}`,
                transformation: scenario.transformation,
            })

            console.log(`   ✅ ${scenario.name} upload successful: ${result.public_id}`)

            // Clean up
            await cloudinary.uploader.destroy(result.public_id)
        } catch (error) {
            console.error(`   ❌ ${scenario.name} upload failed:`, error.message)
        }
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testCloudinarySetup().then((success) => {
        if (success) {
            testUploadScenarios()
        }
    })
}
