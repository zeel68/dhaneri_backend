// Update Account Details
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../Models/userModel.js";

const updateAccountDetails = asyncHandler(async (request, reply) => {
    const { name, phone_number, address } = request.body

    if (!name && !phone_number && !address) {
        return reply.code(400).send(new ApiError(400, "At least one field is required"))
    }

    const updateData = {}
    if (name) updateData.name = name
    if (phone_number) updateData.phone_number = phone_number
    if (address) updateData.address = address

    const user = await User.findByIdAndUpdate(request.user?._id, { $set: updateData }, { new: true }).select(
        "-password -refresh_token",
    )

    return reply.code(200).send(new ApiResponse(200, user, "Account details updated successfully"))
})

// Update User Avatar
const updateUserAvatar = asyncHandler(async (request, reply) => {
    const avatarLocalPath = request.file?.path

    if (!avatarLocalPath) {
        return reply.code(400).send(new ApiError(400, "Avatar file is required"))
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        return reply.code(400).send(new ApiError(400, "Error while uploading avatar"))
    }

    const user = await User.findByIdAndUpdate(
        request.user?._id,
        {
            $set: {
                profile_url: avatar.url,
            },
        },
        { new: true },
    ).select("-password -refresh_token")

    return reply.code(200).send(new ApiResponse(200, user, "Avatar updated successfully"))
})


export { updateUserAvatar, updateAccountDetails }
