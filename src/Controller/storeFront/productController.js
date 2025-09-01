import { request } from "http"
import { Product } from "../../Models/productModel.js"
import { ProductView } from "../../Models/productViewModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { getLocationFromIP } from "../../utils/locationService.js"
import mongoose from "mongoose"
import path from "path"

// Get all products for storefront with filters and pagination
const getStorefrontProducts = async (request, reply) => {
  // try {
  //   const { store_id } = request.params
  //   const {
  //     page = 1,
  //     limit = 12,
  //     category,
  //     min_price,
  //     max_price,
  //     sort = "created_at",
  //     order = "desc",
  //     tags,
  //     in_stock = true,
  //   } = request.query

  //   // Build filter query
  //   const filter = {
  //     store_id: new mongoose.Types.ObjectId(store_id),
  //     is_active: true,
  //     is_published: true,
  //   }

  //   if (category) {
  //     filter.category_id = new mongoose.Types.ObjectId(category)
  //   }

  //   if (min_price || max_price) {
  //     filter.price = {}
  //     if (min_price) filter.price.$gte = Number.parseFloat(min_price)
  //     if (max_price) filter.price.$lte = Number.parseFloat(max_price)
  //   }

  //   if (tags) {
  //     const tagArray = tags.split(",")
  //     filter["tags.name"] = { $in: tagArray }
  //   }

  //   if (in_stock === "true") {
  //     filter["stock.quantity"] = { $gt: 0 }
  //   }

  //   // Build sort object
  //   const sortObj = {}
  //   sortObj[sort] = order === "desc" ? -1 : 1

  //   const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

  //   const products = await Product.find({})
  //     .populate("parent_category", "name")
  //     .populate("store_id", "name")
  //     .sort(sortObj)
  //     .skip(skip)
  //     .limit(Number.parseInt(limit))
  //     .select("-__v")

  //   const total = await Product.countDocuments(filter)
  //   const totalPages = Math.ceil(total / Number.parseInt(limit))

  //   return reply.code(200).send(
  //     new ApiResponse(
  //       200,
  //       {
  //         products,
  //         pagination: {
  //           current_page: Number.parseInt(page),
  //           total_pages: totalPages,
  //           total_items: total,
  //           items_per_page: Number.parseInt(limit),
  //           has_next: Number.parseInt(page) < totalPages,
  //           has_prev: Number.parseInt(page) > 1,
  //         },
  //       },
  //       "Products fetched successfully",
  //     ),
  //   )
  // } catch (error) {
  //   request.log?.error?.(error)
  //   return reply.code(500).send(new ApiResponse(500, {}, "Error fetching products"))
  // }

  try {
    const { store_id } = request.params
    const storeId = store_id
    const {
      category,
      tags,
      minPrice,
      maxPrice,
      page = 1,
      limit = 20,
      sortBy = "created_at",
      sortOrder = "desc",
    } = request.query

    const skip = (page - 1) * limit
    const filter = { store_id: storeId }

    // Apply filters
    if (category) filter.category = category
    if (tags) {
      const tagArray = tags.split(",")
      filter["tags.tagName"] = { $in: tagArray }
    }
    if (minPrice || maxPrice) {
      filter.price = {}
      if (minPrice) filter.price.$gte = Number(minPrice)
      if (maxPrice) filter.price.$lte = Number(maxPrice)
    }

    // Build sort object
    const sort = {}
    sort[sortBy] = sortOrder === "desc" ? -1 : 1

    const [products, total] = await Promise.all([
      Product.find(filter).populate("category", "name").populate("variants").sort(sort).skip(skip).limit(Number(limit)),
      Product.countDocuments(filter),
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          products,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
        "Products fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Something went wrong while fetching products"))
  }
}

// Get single product details for storefront
const getStorefrontProductDetails = async (request, reply) => {
  try {
    const { store_id, product_id } = request.params
    const clientIP = request.ip || request.headers["x-forwarded-for"]
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    const product = await Product.findOne({
      _id: product_id,
      store_id: store_id,
      is_active: true,
      // is_published: true,
    })
      // .populate("StoreCategory", "name description")
      .populate("store_id", "name description contact_email")

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found" + product_id))
    }

    // Track product view
    try {
      const location = await getLocationFromIP(clientIP)
      await ProductView.create({
        store_id: new mongoose.Types.ObjectId(store_id),
        product_id: new mongoose.Types.ObjectId(product_id),
        user_id: user_id || null,
        session_id: session_id || null,
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
        referrer: request.headers.referer || null,
      })
    } catch (trackingError) {
      request.log?.warn?.("Failed to track product view:", trackingError)
    }

    // Get related products
    const relatedProducts = await Product.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      category_id: product.category_id,
      _id: { $ne: product_id },
      is_active: true,
      is_published: true,
    })
      .limit(4)
      .select("name price discount_price images")

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          product,
          related_products: relatedProducts,
        },
        "Product details fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product details"))
  }
}

// Get product filters for storefront
const getStorefrontProductFilters = async (request, reply) => {
  try {
    const { store_id } = request.params

    // Get price range
    const priceRange = await Product.aggregate([
      {
        $match: {
          store_id: new mongoose.Types.ObjectId(store_id),
          is_active: true,
          is_published: true,
        },
      },
      {
        $group: {
          _id: null,
          min_price: { $min: "$price" },
          max_price: { $max: "$price" },
        },
      },
    ])

    // Get available categories
    const categories = await Product.aggregate([
      {
        $match: {
          store_id: new mongoose.Types.ObjectId(store_id),
          is_active: true,
          is_published: true,
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category_id",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $group: {
          _id: "$category._id",
          name: { $first: "$category.name" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { name: 1 },
      },
    ])

    // Get available tags
    const tags = await Product.aggregate([
      {
        $match: {
          store_id: new mongoose.Types.ObjectId(store_id),
          is_active: true,
          is_published: true,
        },
      },
      {
        $unwind: "$tags",
      },
      {
        $group: {
          _id: "$tags.name",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ])

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          price_range: priceRange[0] || { min_price: 0, max_price: 0 },
          categories,
          tags: tags.map((tag) => ({ name: tag._id, count: tag.count })),
        },
        "Product filters fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product filters"))
  }
}

// Search products in storefront
const searchStorefrontProducts = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { q, limit = 10, page = 1 } = request.query

    if (!q || q.trim().length < 2) {
      return reply.code(400).send(new ApiResponse(400, {}, "Search query must be at least 2 characters"))
    }

    const searchRegex = new RegExp(q.trim(), "i")
    const skip = (Number.parseInt(page) - 1) * Number.parseInt(limit)

    const products = await Product.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      // is_active: true,
      // is_published: true,
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { "tags.name": searchRegex },
        { "tags.value": searchRegex },
      ],
    })
      .populate("category", "name")
      .populate({
        path: "variants",
        model: "ProductVariant",
        populate: {
          path: "sizes",
          model: "ProductSizes",
        },


      })
      // .select("name price discount_price images stock")
      .skip(skip)
      .limit(Number.parseInt(limit))

    const total = await Product.countDocuments({
      store_id: new mongoose.Types.ObjectId(store_id),
      // is_active: true,
      // is_published: true,
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { "tags.name": searchRegex },
        { "tags.value": searchRegex },
      ],
    })

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          products,
          search_query: q,
          total_results: total,
          page: Number.parseInt(page),
          limit: Number.parseInt(limit),
        },
        "Search results fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error searching products"))
  }
}

// Get featured products for storefront
const getFeaturedProducts = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { limit = 8 } = request.query

    const products = await Product.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
      is_published: true,
      is_featured: true,
    })
      .populate("category_id", "name")
      .select("name price discount_price images stock")
      .limit(Number.parseInt(limit))
      .sort({ created_at: -1 })

    return reply.code(200).send(new ApiResponse(200, { products }, "Featured products fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching featured products"))
  }
}

// Get new arrivals for storefront
const getNewArrivals = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { limit = 8 } = request.query

    const products = await Product.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      is_active: true,
      is_published: true,
    })
      .populate("category_id", "name")
      .select("name price discount_price images stock")
      .limit(Number.parseInt(limit))
      .sort({ created_at: -1 })

    return reply.code(200).send(new ApiResponse(200, { products }, "New arrivals fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching new arrivals"))
  }
}

const getProductBySlug = async (request, reply) => {
  try {
    const { slug, store_id } = request.params;


    const clientIP = request.ip || request.headers["x-forwarded-for"]
    const user_id = request.user?._id
    const session_id = request.headers["x-session-id"]

    const product = await Product.findOne({
      slug
      // is_published: true,
    })
      .populate({
        path: "variants",
        populate: {
          path: "sizes",
          model: "ProductSizes"
        }
      })

      // .populate("StoreCategory", "name description")
      .populate("store_id", "name description contact_email")

    if (!product) {
      return reply.code(404).send(new ApiResponse(404, {}, "Product not found" + slug))
    }
    console.log(product);

    // Track product view
    try {
      const location = await getLocationFromIP(clientIP)
      await ProductView.create({
        store_id: new mongoose.Types.ObjectId(store_id),
        product_id: new mongoose.Types.ObjectId(product._id),
        user_id: user_id || null,
        session_id: session_id || null,
        ip_address: clientIP,
        user_agent: request.headers["user-agent"],
        location,
        referrer: request.headers.referer || null,
      })
    } catch (trackingError) {
      request.log?.warn?.("Failed to track product view:", trackingError)
    }

    // Get related products
    const relatedProducts = await Product.find({
      store_id: new mongoose.Types.ObjectId(store_id),
      category_id: product.category_id,
      _id: { $ne: product._id },
      is_active: true,
      is_published: true,
    })
      .limit(4)
      .select("name price discount_price images")

    return reply.code(200).send(
      new ApiResponse(
        200,
        {
          product,
          related_products: relatedProducts,
        },
        "Product details fetched successfully",
      ),
    )
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching product details"))
  }
}


export {
  getStorefrontProducts,
  getStorefrontProductDetails,
  getStorefrontProductFilters,
  searchStorefrontProducts,
  getFeaturedProducts,
  getNewArrivals,
  getProductBySlug
}
