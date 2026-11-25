import mongoose from "mongoose";

// In-site notifications (bell in the header and the /notifications page). Kept until the account is deleted.
const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true, maxlength: 140 },
  message: { type: String, default: "", maxlength: 400 },
  link: { type: String, default: "" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

// Notifications used to expire after 60 days through a TTL index on createdAt. Removing `expires` from the
// schema does not remove that index from MongoDB, so it is dropped here once at startup.
export async function dropNotificationExpiry() {
  try {
    const indexes = await Notification.collection.indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined && index.key?.createdAt === 1 && Object.keys(index.key).length === 1);
    if (ttl) { await Notification.collection.dropIndex(ttl.name); console.log("Notification history is now kept (60-day expiry removed)."); }
  } catch (error) {
    if (error.codeName !== "IndexNotFound" && error.codeName !== "NamespaceNotFound") console.error("Could not remove notification expiry:", error.message);
  }
}

// A signed-in customer's cart, so it follows them between tabs and devices.
const cartSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  updatedAt: { type: Number, default: 0 }, // client timestamp (ms) of the last change: the newest cart wins
});

export const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);
