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

const getUserInfo = asyncHandler(async (request, reply) => {
    const storeId = request.user.store_id;
    console.log("storeId", storeId, request.user);

})

const addAddress = asyncHandler(async (request, reply) => {
    const { address } = request.body;
    const user_id = request.user?._id;

    if (!address || typeof address !== "object") {
        return reply.code(400).send(new ApiError(400, "Valid address object is required"));
    }

    const updatedUser = await User.findByIdAndUpdate(
        user_id,
        { $push: { address: address } }, // push object into array
        { new: true, runValidators: true }
    ).select("address");

    if (!updatedUser) {
        return reply.code(404).send(new ApiError(404, "User not found"));
    }

    return reply
        .code(200)
        .send(new ApiResponse(200, updatedUser.address, "Address added successfully"));
});


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


export { updateUserAvatar, updateAccountDetails, getUserInfo, addAddress }
