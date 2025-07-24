import { User } from "../../Models/userModel.js"
import { ApiResponse } from "../../utils/ApiResponse.js"
import { ApiError } from "../../utils/ApiError.js"
import mongoose from "mongoose"

// Get all users
const getAllUsers = async (request, reply) => {
  try {
    const { page = 1, limit = 10, search, role, status, store_id, sort = "created_at", order = "desc" } = request.query

    const skip = (page - 1) * limit
    const filter = {}

    // Apply filters
    if (role && role !== "all") {
      filter.role_name = role
    }
    if (status && status !== "all") {
      filter.status = status
    }
    if (store_id && store_id !== "all") {
      filter.store_id = mongoose.Types.ObjectId(store_id)
    }

    // Apply search
    if (search) {
      filter.$or = [
        { first_name: { $regex: search, $options: "i" } },
        { last_name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ]
    }

    const users = await User.find(filter)
      .sort({ [sort]: order === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit)

    const totalUsers = await User.countDocuments(filter)

    return reply.send(new ApiResponse(users, totalUsers))
  } catch (error) {
    return reply.status(500).send(new ApiError("Internal Server Error", error.message))
  }
}

export { getAllUsers }
