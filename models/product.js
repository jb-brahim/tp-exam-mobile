import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    // keep `imageUrl` for backwards compatibility (filesystem or external URL)
    imageUrl: { type: String, default: "" }, // URL accessible publiquement
    // GridFS file id when image is stored in MongoDB
    imageFileId: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: true }
);

export default mongoose.model("Product", ProductSchema);
