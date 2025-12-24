import mongoose from "mongoose";
import { StoreCategory } from "./product.Model.js";
const { Schema } = mongoose;

const tagSchema = new Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "number", "boolean", "color", "size"],
      default: "text",
    },
    category: {
      type: String,
      enum: Object.values(StoreCategory),
      required: true,
    },
    values: [Schema.Types.Mixed], // Possible values for this tag
  },
  { versionKey: false },
);

export const Tag = mongoose.model("Tag", tagSchema);
