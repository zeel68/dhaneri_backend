import { Product } from "../../Models/productModel.js"
import { Wishlist } from "../../Models/wishlistModel.js"
import { WishlistEvent } from "../../Models/wishlistEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { getLocationFromIP } from "../../utils/locationService.js"
import mongoose from "mongoose"
import { verifyJWT } from "../../Middleware/auth.middleware.js"

// Add product to wishlist
const addToWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];
    const clientIP = request.ip || request.headers["x-forwarded-for"];
    const { product_id, variant_id, size_id } = request.body;

    let user_id;

    console.log("[Request Body]", request.body);
    console.log("[Store ID]", store_id);
    console.log("[Session ID]", session_id);

    // Step 1: Authenticate user if no session_id
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;

      if (!user_id) {
        console.warn("[Auth Error] No session ID or user authentication");
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    if (!product_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Product ID is required"));
    }

    // Step 2: Validate product
    const product = await Product.findOne({
      _id: product_id,
      store_id: store_id,
    }).populate({
      path: "variants",
      populate: {
        path: "sizes",
        model: "ProductSizes",
      },
    });

    if (!product) {
      console.warn(`[Product Error] Product ${product_id} not found in store ${store_id}`);
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"));
    }

    console.log("[Product Found]", product.name);

    // Step 3: Get or create wishlist
    const wishlistQuery = {
      store_id: new mongoose.Types.ObjectId(store_id),
      ...(user_id ? { user_id } : { session_id }),
    };

    let wishlist = await Wishlist.findOne(wishlistQuery);
    console.log("[Wishlist Found]", !!wishlist);

    if (!wishlist) {
      wishlist = new Wishlist({
        ...wishlistQuery,
        items: [],
      });
      console.log("[Wishlist Created]");
    }

    // Step 4: FIXED - Check if product already exists in wishlist with proper null handling
    const existingItemIndex = wishlist.items.findIndex((item) => {
      // Compare product_id
      if (item.product_id.toString() !== product_id) {
        return false;
      }

      // Compare variant_id - handle both null and undefined cases
      const itemVariantId = item.variant_id?.toString() || null;
      const requestVariantId = variant_id || null;

      if (itemVariantId !== requestVariantId) {
        return false;
      }

      // Compare size_id - handle both null and undefined cases
      const itemSizeId = item.size_id?.toString() || null;
      const requestSizeId = size_id || null;

      return itemSizeId === requestSizeId;
    });

    if (existingItemIndex > -1) {
      console.warn("[Wishlist Error] Product already in wishlist");
      return reply.code(400).send(new ApiResponse(400, {}, "Product already in wishlist"));
    }

    // Step 5: Add item to wishlist
    console.log("[Wishlist Add] Adding new item to wishlist", product_id);
    wishlist.items.push({
      product_id,
      variant_id: variant_id || null,
      size_id: size_id || null,
      added_at: new Date(),
    });

    // Step 6: Clean up invalid product IDs before saving
    console.log("[Validation] Filtering invalid products before saving wishlist...");

    const validItems = [];
    for (const item of wishlist.items) {
      const exists = await Product.exists({ _id: item.product_id });
      if (!exists) {
        console.warn(`[Invalid Product Removed] product_id: ${item.product_id}`);
        continue;
      }
      validItems.push(item);
    }
    wishlist.items = validItems;

    console.log("[Wishlist Items Before Save]", wishlist.items.map(i => ({
      product_id: i.product_id.toString(),
      variant_id: i.variant_id?.toString(),
      size_id: i.size_id?.toString(),
      added_at: i.added_at,
    })));

    // Step 7: Save wishlist
    await wishlist.save();
    console.log("[Wishlist Saved]");

    // Step 8: Track wishlist event
    try {
      const location = await getLocationFromIP(clientIP);
      await WishlistEvent.create({
        store_id: store_id,
        user_id: user_id || null,
        session_id: session_id || null,
        product_id: product_id,
        variant_id: variant_id || null,
        size_id: size_id || null,
        action: "add",
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
      });
      console.log("[Wishlist Event Tracked]");
    } catch (trackingError) {
      console.warn("[Wishlist Tracking Error]", trackingError);
    }

    // Step 9: Return populated wishlist
    const populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("items.product_id", "name price images discount_price compare_price")
      .populate("items.variant_id", "color images price stock_quantity")
      .populate("items.size_id", "size stock priceModifier sku attributes", "ProductSizes")
      .lean();

    populatedWishlist.session_id = session_id;

    console.log("[Wishlist Response Sent]");
    return reply
      .code(200)
      .send(new ApiResponse(200, { wishlist: populatedWishlist }, "Product added to wishlist successfully"));
  } catch (error) {
    console.error("[Add To Wishlist Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error adding product to wishlist"));
  }
};
// Get wishlist for user/session and store
const getWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];
    const { page = 1, limit = 20 } = request.query;

    console.log("[Session ID]", session_id);

    let user_id;
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;
      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    let wishlist;

    if (user_id) {
      wishlist = await Wishlist.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) });
    } else if (session_id) {
      wishlist = await Wishlist.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) });
    }

    if (!wishlist) {
      return reply.code(200).send(new ApiResponse(200, { wishlist: { items: [] } }, "Wishlist is empty"));
    }

    // Populate wishlist items
    let populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("items.product_id", "name price images discount_price slug compare_price stock category_id")
      .populate("items.variant_id", "color images price stock_quantity")
      .populate("items.size_id", "size stock priceModifier sku attributes", "ProductSizes")
      .lean({ virtuals: true });

    // Filter out invalid products and sort by added_at
    const validItems = populatedWishlist.items
      .filter(item => item.product_id !== null)
      .sort((a, b) => new Date(b.added_at) - new Date(a.added_at));

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedItems = validItems.slice(skip, skip + parseInt(limit));

    const total = validItems.length;
    const totalPages = Math.ceil(total / parseInt(limit));

    populatedWishlist.items = paginatedItems;
    populatedWishlist.session_id = session_id;

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          wishlist: populatedWishlist,
          pagination: {
            current_page: parseInt(page),
            total_pages: totalPages,
            total_items: total,
            items_per_page: parseInt(limit),
            has_next: parseInt(page) < totalPages,
            has_prev: parseInt(page) > 1,
          },
        },
        "Wishlist fetched successfully",
      ),
    );
  } catch (error) {
    console.error("[Get Wishlist Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching wishlist"));
  }
};

// Remove product from wishlist
const removeFromWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];
    const clientIP = request.ip || request.headers["x-forwarded-for"];
    console.log(request.body);

    const { product_id, variant_id, size_id } = request.body;

    let user_id;


    console.log("[Remove Request]", { product_id, variant_id, size_id });

    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;
      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    if (!product_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Product ID is required"));
    }

    let wishlist;
    if (user_id) {
      wishlist = await Wishlist.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) });
    } else if (session_id) {
      wishlist = await Wishlist.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) });
    }

    if (!wishlist) {
      return reply.code(404).send(new ApiResponse(404, {}, "Wishlist not found"));
    }

    // Remove item from wishlist
    const initialLength = wishlist.items.length;
    wishlist.items = wishlist.items.filter(
      (item) =>
        !(item.product_id.toString() === product_id &&
          (variant_id ? item.variant_id?.toString() === variant_id : true) &&
          (size_id ? item.size_id?.toString() === size_id : true))
    );

    if (wishlist.items.length === initialLength) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found in wishlist"));
    }

    await wishlist.save();

    // Track wishlist event
    try {
      const location = await getLocationFromIP(clientIP);
      await WishlistEvent.create({
        store_id: store_id,
        user_id: user_id || null,
        session_id: session_id || null,
        product_id: product_id,
        variant_id: variant_id || null,
        size_id: size_id || null,
        action: "remove",
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
      });
    } catch (trackingError) {
      console.warn("[Wishlist Tracking Error]", trackingError);
    }

    const populatedWishlist = await Wishlist.findById(wishlist._id)
      .populate("items.product_id", "name price images discount_price")
      .lean();

    populatedWishlist.session_id = session_id;

    return reply.code(200).send(new ApiResponse(200, { wishlist: populatedWishlist }, "Product removed from wishlist successfully"));
  } catch (error) {
    console.error("[Remove From Wishlist Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error removing product from wishlist"));
  }
};

// Clear entire wishlist for a store
const clearWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];

    console.log("[Clear Wishlist] Session ID:", session_id);

    let user_id;
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;
      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    let wishlist;
    if (user_id) {
      wishlist = await Wishlist.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) });
    } else if (session_id) {
      wishlist = await Wishlist.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) });
    }

    if (!wishlist) {
      return reply.code(404).send(new ApiResponse(404, {}, "Wishlist not found"));
    }

    wishlist.items = [];
    await wishlist.save();

    return reply.code(200).send(new ApiResponse(200, { wishlist }, "Wishlist cleared successfully"));
  } catch (error) {
    console.error("[Clear Wishlist Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error clearing wishlist"));
  }
};

// Check if product is in wishlist
const checkWishlistStatus = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params;
    const session_id = request.headers["x-session-id"];
    const { variant_id, size_id } = request.query;

    console.log("[Check Wishlist Status]", { product_id, variant_id, size_id });

    let user_id;
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;
      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    let wishlist;
    if (user_id) {
      wishlist = await Wishlist.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) });
    } else if (session_id) {
      wishlist = await Wishlist.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) });
    }

    let is_in_wishlist = false;
    let wishlist_item = null;

    if (wishlist) {
      const item = wishlist.items.find((item) =>
        item.product_id.toString() === product_id &&
        (variant_id ? item.variant_id?.toString() === variant_id : true) &&
        (size_id ? item.size_id?.toString() === size_id : true)
      );

      if (item) {
        is_in_wishlist = true;
        wishlist_item = item;
      }
    }

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          is_in_wishlist,
          wishlist_item,
        },
        "Wishlist status checked successfully"
      )
    );
  } catch (error) {
    console.error("[Check Wishlist Status Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error checking wishlist status"));
  }
};

// Move wishlist items from session to user after login
const migrateWishlist = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];

    await verifyJWT(request, reply);
    const user_id = request.user?._id;

    if (!user_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "User authentication required"));
    }

    if (!session_id) {
      return reply.code(400).send(new ApiResponse(400, {}, "Session ID required for migration"));
    }

    // Find session wishlist
    const sessionWishlist = await Wishlist.findOne({
      session_id,
      store_id: new mongoose.Types.ObjectId(store_id)
    });

    if (!sessionWishlist || sessionWishlist.items.length === 0) {
      return reply.code(200).send(new ApiResponse(200, {}, "No items to migrate"));
    }

    // Find or create user wishlist
    let userWishlist = await Wishlist.findOne({
      user_id,
      store_id: new mongoose.Types.ObjectId(store_id)
    });

    if (!userWishlist) {
      userWishlist = new Wishlist({
        user_id,
        store_id: new mongoose.Types.ObjectId(store_id),
        items: [],
      });
    }

    // Merge items, avoiding duplicates
    for (const sessionItem of sessionWishlist.items) {
      const exists = userWishlist.items.some(userItem =>
        userItem.product_id.toString() === sessionItem.product_id.toString() &&
        userItem.variant_id?.toString() === sessionItem.variant_id?.toString() &&
        userItem.size_id?.toString() === sessionItem.size_id?.toString()
      );

      if (!exists) {
        userWishlist.items.push({
          product_id: sessionItem.product_id,
          variant_id: sessionItem.variant_id,
          size_id: sessionItem.size_id,
          added_at: sessionItem.added_at,
        });
      }
    }

    await userWishlist.save();

    // Delete session wishlist
    await Wishlist.deleteOne({ _id: sessionWishlist._id });

    const populatedWishlist = await Wishlist.findById(userWishlist._id)
      .populate("items.product_id", "name price images discount_price")
      .lean();

    return reply.code(200).send(
      new ApiResponse(200, { wishlist: populatedWishlist }, "Wishlist migrated successfully")
    );
  } catch (error) {
    console.error("[Migrate Wishlist Error]", error);
    request.log?.error?.(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error migrating wishlist"));
  }
};

export {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  clearWishlist,
  checkWishlistStatus,
  migrateWishlist
};