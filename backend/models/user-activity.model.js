import mongoose from "mongoose";

// What signed-in customers do on the site, for the admin Activity tab: sign-ins, pages opened and buttons/links clicked.
// Kept for 180 days, then removed by MongoDB automatically.
const userActivitySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ["login", "page_view", "click"], required: true, index: true },
  // Page path (with query string) where it happened.
  path: { type: String, default: "", maxlength: 300 },
  // Clicks: the visible text of the button or link, and where a link goes.
  label: { type: String, default: "", maxlength: 120 },
  href: { type: String, default: "", maxlength: 300 },
  // Sign-ins: how they signed in (email, Google, …).
  method: { type: String, default: "", maxlength: 40 },
  ip: { type: String, default: "", maxlength: 64 },
  userAgent: { type: String, default: "", maxlength: 400 },
  device: { type: String, default: "" },
  browser: { type: String, default: "" },
  os: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
}, { versionKey: false });

userActivitySchema.index({ userId: 1, createdAt: -1 });
userActivitySchema.index({ createdAt: -1 });

export const UserActivity = mongoose.models.UserActivity || mongoose.model("UserActivity", userActivitySchema);
