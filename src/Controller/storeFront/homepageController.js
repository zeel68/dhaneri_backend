// import { Homepage } from "../../Models/homepageModel.js"
import { Store } from "../../Models/storeModel.js"
import { Product } from "../../Models/productModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import { HeroSlide, Testimonial, TrendingCategory, TrendingProduct } from "../../Models/homepageModel.js";

import mongoose from "mongoose"


// Get complete homepage data
const getHomepageData = async (request, reply) => {
  try {
    const { store_id } = request.params
    console.log("Hello Home Pag",);

    // Get store info
    const store = await Store.findOne({
      _id: store_id,
      is_active: true,
    }).select("name description logo banner contact_email contact_phone address social_links")

    if (!store) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    // Get homepage configuration
    const [heroSlides, trendingCategories, testimonials] = await Promise.all([
      HeroSlide.find({ store_id, is_active: true }).sort({ display_order: 1 }),
      TrendingCategory.find({ store_id })
        // .sort({ display_order: 1 })
        .populate(
          "category_id"
        ),

      // TrendingProduct.find({ store_id: storeId })
      //     .populate("product", "name description price images stock ratings")
      //     .sort({ display_order: 1 }),
      Testimonial.find({ store_id }).sort({ createdAt: -1 }),
    ])

    const homepageConfig = {
      heroSlides,
      trendingCategories,


      testimonials,
    }

    return reply.code(200).send(new ApiResponse(200, homepageConfig, "Homepage configuration fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send(new ApiResponse(error.statusCode, {}, error.message))
    }
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching homepage configuration"))
  }
}

// Get hero section data
const getHeroSection = async (request, reply) => {
  try {
    const { store_id } = request.params
    console.log(store_id);

    const heroSection = await HeroSlide.find({ store_id, is_active: true }).sort({ display_order: 1 })

    // const heroSection = homepage?.hero_section || []

    return reply
      .code(200)
      .send(new ApiResponse(200, heroSection, "Hero section fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching hero section"))
  }
}

// Get testimonials
const getTestimonials = async (request, reply) => {
  try {
    const { store_id } = request.params
    const { limit = 10 } = request.query

    const testimonials = await Testimonial.find({ store_id }).sort({ createdAt: -1 })




    // Apply limit if specified
    // if (limit && Number.parseInt(limit) > 0) {
    //   testimonials = testimonials.slice(0, Number.parseInt(limit))
    // }

    return reply.code(200).send(new ApiResponse(200, testimonials, "Testimonials fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching testimonials"))
  }
}

// Get store info
const getStoreInfo = async (request, reply) => {
  try {
    const { store_id } = request.params

    const store = await Store.findOne({
      _id: store_id,
      is_active: true,
    }).select("name description logo banner contact_email contact_phone address social_links business_hours policies")

    if (!store) {
      return reply.code(404).send(new ApiResponse(404, {}, "Store not found"))
    }

    return reply.code(200).send(new ApiResponse(200, { store }, "Store info fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store info"))
  }
}

const getTrendingProducts = async (request, reply) => {
  try {
    const { storeId } = request.params
    const trendingProducts = await TrendingProduct.find({ store_id: storeId })
      .populate("product_id", "")
    // .sort({ display_order: 1 })

    return reply.code(200).send(new ApiResponse(200, trendingProducts, "Trending products fetched successfully"))
  } catch (error) {
    request.log?.error?.(error)
    return reply.code(500).send(new ApiResponse(500, {}, "Error fetching trending products"))
  }
}
const getTrendingCategories = async (request, reply) => {
  try {
    const { storeId } = request.params;
    console.log("storeId:", storeId);

    const trendingCategories = await TrendingCategory.find({
      store_id: storeId,
      category_id: { $ne: null } // filter out nulls
    })
      .populate("category_id", "display_name description img_url") // populate only valid categories
      .sort({ display_order: 1 }); // optional: ensure proper order

    // Remove any entries where populate failed (category was deleted)
    const validCategories = trendingCategories.filter(tc => tc.category_id);

    return reply
      .code(200)
      .send(new ApiResponse(200, validCategories, "Trending categories fetched successfully"));
  } catch (error) {
    request.log?.error?.(error.toString());
    console.error(error);
    return reply
      .code(500)
      .send(new ApiResponse(500, {}, "Error fetching trending categories"));
  }
};


export { getHomepageData, getHeroSection, getTestimonials, getStoreInfo, getTrendingProducts, getTrendingCategories }
