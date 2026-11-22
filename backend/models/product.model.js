import mongoose from "mongoose";

const codeSchema = new mongoose.Schema({
  value: { type: String, required: true, trim: true },
  status: { type: String, enum: ["available", "reserved", "sold"], default: "available" },
  orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  price: { type: Number, required: true, min: 0 },
  priceUsd: { type: Number, default: 0, min: 0 },
  priceBdt: { type: Number, default: 0, min: 0 },
  stockQuantity: { type: Number, default: null, min: 0 },
  secretCode: { type: String, default: "", trim: true, maxlength: 2048 },
  codes: { type: [codeSchema], default: [] },
}, { _id: true });

const reviewSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "", trim: true, maxlength: 80 },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, maxlength: 1000 },
  likes: { type: [String], default: [] },
  adminReply: {
    text: { type: String, default: "", trim: true, maxlength: 1500 },
    adminEmail: { type: String, default: "", trim: true, lowercase: true },
    repliedAt: { type: Date, default: null },
  },
}, { timestamps: true });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  codeNumber: { type: String, required: true, trim: true, maxlength: 80 },
  imageUrl: { type: String, default: "", maxlength: 2048 },
  category: { type: String, default: "Other", trim: true, maxlength: 60 },
  brand: { type: String, default: "", trim: true, maxlength: 80 },
  discountPercent: { type: Number, default: 0, min: 0, max: 99 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
  showInPopular: { type: Boolean, default: true },
  popularOrder: { type: Number, default: 0, min: 0 },
  price: { type: Number, required: true, min: 0 },
  priceUsd: { type: Number, default: 0, min: 0 },
  priceBdt: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: "USD", uppercase: true, maxlength: 3 },
  active: { type: Boolean, default: true },
  codes: { type: [codeSchema], default: [] },
  variants: { type: [variantSchema], default: [] },
  reviews: { type: [reviewSchema], default: [] },
}, { timestamps: true });

export const Product = mongoose.models.Product || mongoose.model("Product", productSchema);
