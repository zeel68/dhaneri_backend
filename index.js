// index.js (Vercel Entry Point)
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import dotenv from "dotenv";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import connectDB from "./src/DB/connection.js";
import { corsOptions } from "./src/Middleware/security.middleware.js";
import { databaseService } from "./src/utils/database.js";

// Routes
import authRoutes from "./src/Routes/authRouter.js";
import storeAdminRoutes from "./src/Routes/storeAdminRouter.js";
import superAdminRouter from "./src/Routes/superAdminRouter.js";
import storefrontRoutes from "./src/Routes/storeFrontRouter.js";

dotenv.config({ path: "./.env" });

let app;
let isReady = false;

async function buildApp() {
    app = Fastify({
        logger: true,
        trustProxy: true,
    });

    // Security plugins
    await app.register(cors, corsOptions);

    await app.register(rateLimit, {
        max: 10000,
        timeWindow: "15 minutes",
        keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
        errorResponseBuilder: function () {
            return {
                success: false,
                message: "Too many requests, please try again later.",
                statusCode: 429,
            };
        },
    });

    await app.register(cookie, {
        secret: process.env.COOKIE_SECRET || "your-secret-key-change-in-production",
        parseOptions: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
        },
    });

    await app.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024,
            files: 10,
        },
    });

    // Connect to DB
    await connectDB();

    // Routes
    app.get("/", async () => ({
        message: "🚀 BizzWeb API Server",
        version: "1.0.0",
        health: "/health",
        timestamp: new Date().toISOString(),
    }));

    app.get("/health", async () => {
        const dbStatus = await databaseService.healthCheck();

        const memoryUsage = process.memoryUsage();
        const formattedMemory = {
            rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
            heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
            heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
            arrayBuffers: `${(memoryUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`,
        };

        return {
            status: "OK",
            timestamp: new Date().toISOString(),
            uptime: `${process.uptime().toFixed(2)} seconds`,
            version: process.env.npm_package_version || "1.0.0",
            database: dbStatus,
            memory: formattedMemory,
        };
    });

    // Register routes
    app.register(authRoutes, { prefix: "/api/auth" });
    app.register(storeAdminRoutes, { prefix: "/api/store-admin" });
    app.register(superAdminRouter, { prefix: "/api/superAdmin" });
    app.register(storefrontRoutes, { prefix: "/api/storefront" });

    await app.ready();
    isReady = true;
}

export default async function handler(req, res) {
    try {
        if (!isReady) {
            await buildApp();
        }
        app.server.emit("request", req, res);
    } catch (err) {
        console.error("❌ Vercel Handler Error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
    }
}
