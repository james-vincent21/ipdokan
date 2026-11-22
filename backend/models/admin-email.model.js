import mongoose from "mongoose";

const adminEmailSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  addedBy: { type: String, default: "", lowercase: true, trim: true },
}, { timestamps: true, collection: "adminemails" });

export const AdminEmail = mongoose.models.AdminEmail || mongoose.model("AdminEmail", adminEmailSchema);
