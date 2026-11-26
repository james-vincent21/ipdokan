import mongoose from "mongoose";

// Discount codes made in the admin panel. They work on the products in `productIds`, or on every product when it is empty.
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
  productIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // Empty = every customer. Otherwise only these accounts; both the account id and its email must match.
  allowedUsers: { type: [{ _id: false, userId: { type: String, required: true }, email: { type: String, required: true, lowercase: true, trim: true }, name: { type: String, default: "" } }], default: [] },
  createdBy: { type: String, default: "" },
}, { timestamps: true });

export const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);
