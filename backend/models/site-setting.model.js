import mongoose from "mongoose";

// Site-wide settings changed from the admin panel, one document per key (for example "devMode").
const siteSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedBy: { type: String, default: "" },
}, { timestamps: true });

export const SiteSetting = mongoose.models.SiteSetting || mongoose.model("SiteSetting", siteSettingSchema);
