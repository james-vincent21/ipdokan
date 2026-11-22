import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String },
  email: { type: String },
  emailVerified: { type: Boolean },
  image: { type: String },
  phone: { type: String, default: "", trim: true, maxlength: 32 },
  createdAt: { type: Date },
  updatedAt: { type: Date },
}, { collection: "user", versionKey: false, strict: false });

export const User = mongoose.models.BetterAuthUser || mongoose.model("BetterAuthUser", userSchema, "user");
