import mongoose from "mongoose";

// In-site notifications (bell in the header). Old ones are removed automatically after 60 days.
const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true, maxlength: 140 },
  message: { type: String, default: "", maxlength: 400 },
  link: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 60 },
});
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

// A signed-in customer's cart, so it follows them between tabs and devices.
const cartSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  updatedAt: { type: Number, default: 0 }, // client timestamp (ms) of the last change: the newest cart wins
});

export const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
