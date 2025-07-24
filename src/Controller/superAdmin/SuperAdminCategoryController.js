import {ApiResponse} from "../../utils/ApiResponse.js";
import {Category} from "../../Models/categoryModel.js";
import {Store} from "../../Models/storeModel.js";
import {StoreCategoryModel} from "../../Models/storeCategoryModel.js";

const getGlobalCategories = async (request, reply) => {

    try {

        const categories = await Category.find();


        if (!categories) {
            return reply.code(404).send(new ApiResponse(404, {}, "categories not found"));
        }
        return reply.code(200).send(new ApiResponse(200, categories, "Store category fetched successfully"));
    } catch (error) {
        return reply.code(500).send(new ApiResponse(500, {}, "Error fetching store category"));
    }
}

const addGlobalCategory = async (request, reply) => {
    const storeId = request.user.store_id;
    const { category_name, img_url, tag_schema = [] } = request.body;

    if (!category_name?.trim()) {
        return reply.code(400).send(new ApiResponse(400, {}, "Category name is required"));
    }

    try {
        // Check for duplicate category name (globally unique in schema)
        const existingCategory = await Category.findOne({ name: category_name.trim() });
        if (existingCategory) {
            return reply.code(409).send(new ApiResponse(409, {}, "Category name already exists"));
        }

        const category = await Category.create({
            name: category_name.trim(),
            image_url: img_url || "",
            store_id: storeId,
            tag_schema
        });

        return reply.code(201).send(new ApiResponse(201, category, "Category added successfully"));
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send(new ApiResponse(500, {}, "Error adding category"));
    }
};

export {getGlobalCategories,addGlobalCategory}
