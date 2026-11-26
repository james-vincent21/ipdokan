import mongoose from "mongoose";

// Discount codes made in the admin panel. They work on every product.
// "percent": `percent`% off the product price. "fixed": a set amount off, given in each currency.
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },
  type: { type: String, enum: ["percent", "fixed"], required: true },
  percent: { type: Number, default: 0, min: 0, max: 99 },
  amountUsd: { type: Number, default: 0, min: 0 },
  amountBdt: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },
  // 0 = no limit. Counts checkouts (a cart paid together is one use), not orders.
  maxUses: { type: Number, default: 0, min: 0 },
  onePerUser: { type: Boolean, default: true },
  createdBy: { type: String, default: "" },
}, { timestamps: true });

export const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
