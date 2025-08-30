import { Product } from "../../Models/productModel.js"
import { Cart } from "../../Models/cartModel.js"
import { Coupon } from "../../Models/couponModel.js"
import { CartEvent } from "../../Models/cartEventModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { getLocationFromIP } from "../../utils/locationService.js"
import mongoose from "mongoose"
import { verifyJWT } from "../../Middleware/auth.middleware.js"

// Add item to cart
const addToCart = async (request, reply) => {
  try {
    const { store_id } = request.params;
    const session_id = request.headers["x-session-id"];
    const clientIP = request.ip || request.headers["x-forwarded-for"];
    const { product_id, quantity = 1, variant_id, size_id } = request.body;

    let user_id;
    console.log(request.body);


    // Check user authentication if session_id is not provided
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id;

      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"));
      }
    }

    // Validate product
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
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found"));
    }

    // Determine applicable price and stock
    let price = product.discount_price || product.price;
    let stockQuantity = product.stock?.quantity || 0;

    if (variant_id) {
      console.log(variant_id, size_id);

      const variant = product.variants.find(
        (v) => v._id.toString() === variant_id
      );

      if (!variant) {
        return reply.code(400).send(new ApiResponse(400, {}, "Variant not found for this product"));
      }

      price = variant.price || price;
      let selectedSize = variant.sizes.filter((size) => {
        console.log(size._id);
        return size._id == size_id
      });
      console.log(selectedSize);

      if (selectedSize) {
        stockQuantity = selectedSize[0].stock || stockQuantity;
      }
      stockQuantity = variant.stock_quantity || stockQuantity;
    }

    if (stockQuantity < quantity) {
      console.log(stockQuantity, quantity);

      return reply.code(400).send(new ApiResponse(400, {}, "Insufficient stock"));
    }

    // Get or create cart
    let cartQuery = { store_id: new mongoose.Types.ObjectId(store_id) };
    if (user_id) {
      cartQuery.user_id = user_id;
    } else {
      cartQuery.session_id = session_id;
    }

    let cart = await Cart.findOne(cartQuery);

    if (!cart) {
      cart = new Cart({
        ...cartQuery,
        items: [],
      });
    }

    // Check for existing item in cart
    const existingItemIndex = cart.items.findIndex((item) =>
      item.product_id.toString() === product_id &&
      (variant_id ? item.variant_id?.toString() === variant_id : true) &&
      (size_id ? item.size_id?.toString() === size_id : true)
    );


    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      console.log("productId", product_id);

      cart.items.push({
        product_id,
        variant_id: variant_id || null,
        size_id: size_id || null,
        quantity,
        price_at_addition: price,
        price,
      });
    }

    cart.calculateTotals(); // assume this mutates `cart`
    await cart.save();

    // Track cart event
    try {
      const location = await getLocationFromIP(clientIP);
      await CartEvent.create({
        store_id: store_id,
        user_id: user_id || null,
        session_id: session_id || null,
        product_id: product_id,
        variant_id: variant_id ? variant_id : null,
        size_id: size_id ? size_id : null,
        action: "add",
        quantity,
        price_at_addition: price,
        price,
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
      });
    } catch (trackingError) {
      request.log?.warn?.("Failed to track cart event:", trackingError);
    }

    // Return updated cart with populated items
    const populatedCart = await Cart.findById(cart._id)
      .populate("items.product_id", "name price images discount_price")
      .lean();

    populatedCart.session_id = session_id;

    return reply
      .code(200)
      .send(new ApiResponse(200, { cart: populatedCart }, "Item added to cart successfully"));
  } catch (error) {
    request.log?.error?.(error);
    console.error(error);
    return reply.code(500).send(new ApiResponse(500, {}, "Error adding item to cart"));
  }
};


// Get cart for user and store
const getCart = async (request, reply) => {
  try {
    const { store_id } = request.params
    const session_id = request.headers["x-session-id"]
    console.log("session_id", session_id);
    let user_id;
    if (!session_id) {
      await verifyJWT(request, reply);
      user_id = request.user?._id
      if (!user_id) {
        return reply.code(400).send(new ApiResponse(400, {}, "Session ID or User authentication required"))
      }
    }

    let cart

    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart) {
      return reply.code(200).send(new ApiResponse(200, { cart: { items: [], subtotal: 0, total: 0 } }, "Cart is empty"))
    }

    let populatedCart = await Cart.findById(cart._id)
      .populate("items.product_id", "name price images discount_price stock")
      .populate("items.variant_id", "color images price stock_quantity")
      .populate("items.size_id", "size stock priceModifier sku attributes", "ProductSizes")
      .populate("coupon_id", "code discount_type discount_value")
      .lean();


    // populatedCart.items.forEach(item => {
    //   let temp = item.product_id.variants.forEach((variant) => {

    //     // variant.sizes.filter((size) => {
    //     //   if (size.id == item.variant_id) {
    //     //     console.log("size", size);
    //     //     let temp_variant = variant
    //     //     temp_variant.sizes = variant.sizes.filter((s) => s.id == item.variant_id)[0]

    //     //     item.selectedVariant = temp_variant
    //     //   }

    //     // });
    //     let a = variant.sizes.filter((size) => size.id == item.variant_id

    //     );
    //     console.log((a));
    //     variant.sizes = a

    //   })
    //   item.product_id.variants = item.product_id.variants.filter((variant) => variant.sizes.length > 0)



    //   // let b = temp.filter((variant) => variant.sizes.length > 0)
    //   // console.log("b", a);



    // })

    // populatedCart.items.product_id.variants = populatedCart.items.product_id.variants.filter((variant) => variant.id === populatedCart.items.variant_id)

    populatedCart.session_id = session_id;

    return reply.code(200).send(new ApiResponse(200, { cart: populatedCart }, "Cart fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching cart"))
  }
}

// Update cart item quantity
const updateCartItem = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id, quantity, variant_id } = request.body
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart) {
      return reply.code(404).send(new ApiResponse(404, {}, "Cart not found"))
    }

    const itemIndex = cart.items.findIndex(
      (item) =>
        item.product_id.toString() === product_id && (!variant_id || item.variant_id?.toString() === variant_id),
    )

    if (itemIndex === -1) {
      return reply.code(404).send(new ApiResponse(404, {}, "Item not found in cart"))
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1)
    } else {
      // Check stock
      const product = await Product.findById(product_id)
      if (product.stock.quantity < quantity) {
        return reply.code(400).send(new ApiResponse(400, {}, "Insufficient stock"))
      }
      cart.items[itemIndex].quantity = quantity
    }

    // cart.calculateTotals()
    await cart.save()

    const populatedCart = await Cart.findById(cart._id).populate("items.product_id", "name price images discount_price")

    return reply.code(200).send(new ApiResponse(200, { cart: populatedCart }, "Cart updated successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error updating cart"))
  }
}

// Remove item from cart
const removeCartItem = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { product_id, variant_id } = request.body
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart) {
      return reply.code(404).send(new ApiResponse(404, {}, "Cart not found"))
    }

    cart.items = cart.items.filter(
      (item) =>
        !(item.product_id.toString() === product_id && (!variant_id || item.variant_id?.toString() === variant_id)),
    )

    cart.calculateTotals()
    await cart.save()

    const populatedCart = await Cart.findById(cart._id).populate("items.product_id", "name price images discount_price")

    return reply.code(200).send(new ApiResponse(200, { cart: populatedCart }, "Item removed from cart successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error removing item from cart"))
  }
}

// Clear entire cart
const clearCart = async (request, reply) => {
  try {
    const { store_id } = request.params
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart) {
      return reply.code(404).send(new ApiResponse(404, {}, "Cart not found"))
    }

    cart.items = []
    cart.coupon_id = null
    cart.calculateTotals()
    await cart.save()

    return reply.code(200).send(new ApiResponse(200, { cart }, "Cart cleared successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error clearing cart"))
  }
}

// Apply coupon to cart
const applyCoupon = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { coupon_code } = request.body
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart || cart.items.length === 0) {
      return reply.code(400).send(new ApiResponse(400, {}, "Cart is empty"))
    }

    const coupon = await Coupon.findOne({
      code: coupon_code,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
      start_date: { $lte: new Date() },
      end_date: { $gte: new Date() },
    })

    if (!coupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Invalid or expired coupon"))
    }

    // Check usage limits
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return reply.code(400).send(new ApiResponse(400, {}, "Coupon usage limit exceeded"))
    }

    // Check minimum order value
    if (coupon.minimum_order_value && cart.subtotal < coupon.minimum_order_value) {
      return reply
        .code(400)
        .send(new ApiResponse(400, {}, `Minimum order value of ${coupon.minimum_order_value} required`))
    }

    cart.coupon_id = coupon._id
    cart.calculateTotals()
    await cart.save()

    const populatedCart = await Cart.findById(cart._id)
      .populate("items.product_id", "name price images discount_price")
      .populate("coupon_id", "code discount_type discount_value")

    return reply.code(200).send(new ApiResponse(200, { cart: populatedCart }, "Coupon applied successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error applying coupon"))
  }
}

// Validate coupon without applying
const validateCoupon = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { coupon_code } = request.body
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    if (!coupon_code) {
      return reply.code(400).send(new ApiResponse(400, {}, "Coupon code is required"))
    }

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart || cart.items.length === 0) {
      return reply.code(400).send(new ApiResponse(400, {}, "Cart is empty"))
    }

    const coupon = await Coupon.findOne({
      code: coupon_code,
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
      start_date: { $lte: new Date() },
      end_date: { $gte: new Date() },
    })

    if (!coupon) {
      return reply.code(404).send(new ApiResponse(404, {}, "Invalid or expired coupon"))
    }

    // Check usage limits
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return reply.code(400).send(new ApiResponse(400, {}, "Coupon usage limit exceeded"))
    }

    // Check minimum order value
    if (coupon.minimum_order_value && cart.subtotal < coupon.minimum_order_value) {
      return reply
        .code(400)
        .send(new ApiResponse(400, {}, `Minimum order value of ${coupon.minimum_order_value} required`))
    }

    // Calculate discount
    let discountAmount = 0
    if (coupon.discount_type === "percentage") {
      discountAmount = (cart.subtotal * coupon.discount_value) / 100
      if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
        discountAmount = coupon.max_discount_amount
      }
    } else if (coupon.discount_type === "fixed") {
      discountAmount = coupon.discount_value
    }

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          coupon: {
            code: coupon.code,
            description: coupon.description,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value,
            discount_amount: Math.round(discountAmount * 100) / 100,
          },
          valid: true,
        },
        "Coupon is valid",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error validating coupon"))
  }
}

// Remove coupon from cart
const removeCoupon = async (request, reply) => {
  try {
    const { store_id } = request.params
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    let cart
    if (user_id) {
      cart = await Cart.findOne({ user_id, store_id: new mongoose.Types.ObjectId(store_id) })
    } else if (session_id) {
      cart = await Cart.findOne({ session_id, store_id: new mongoose.Types.ObjectId(store_id) })
    }

    if (!cart) {
      return reply.code(404).send(new ApiResponse(404, {}, "Cart not found"))
    }

    cart.coupon_id = null
    cart.calculateTotals()
    await cart.save()

    const populatedCart = await Cart.findById(cart._id).populate("items.product_id", "name price images discount_price")

    return reply.code(200).send(new ApiResponse(200, { cart: populatedCart }, "Coupon removed successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error removing coupon"))
  }
}

export { addToCart, getCart, updateCartItem, removeCartItem, clearCart, applyCoupon, validateCoupon, removeCoupon }
