import mongoose from "mongoose";

const productActivitySchema = new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  productName: { type: String, required: true, trim: true },
  action: { type: String, enum: ["added", "edited", "deleted", "stock_renewed", "codes_added", "order_cancelled", "order_deleted"], required: true },
  adminEmail: { type: String, required: true, lowercase: true, trim: true },
  details: { type: String, default: "", trim: true, maxlength: 300 },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: "productactivities" });

productActivitySchema.index({ createdAt: -1 });

export const ProductActivity = mongoose.models.ProductActivity || mongoose.model("ProductActivity", productActivitySchema);
