// Socket.IO: live notifications and cart sync for signed-in users.
// Served at /api/socket.io (nginx already sends /api/ to this server). Each signed-in socket joins the
// room "user:<id>"; admins also join "admins".
//   server → client  "notification"  { id, type, title, message, link, createdAt, read }
//   server → client  "cart"          { items, updatedAt }        (the newest saved cart)
//   client → server  "cart:save"     { items, updatedAt }        (after every local cart change)
import { Server } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";
import { config } from "../config/env.js";
import { AdminEmail } from "../models/admin-email.model.js";
import { Cart, Notification } from "../models/notification.model.js";

let io = null;
const MAX_CART_ITEMS = 50;

async function isAdminEmail(email) {
  const value = String(email || "").toLowerCase();
  if (!value) return false;
  return config.adminEmails.includes(value) || Boolean(await AdminEmail.exists({ email: value }));
}

function cleanCart(items) {
  if (!Array.isArray(items)) return [];
  // Only plain objects, at most 50 lines; the checkout validates prices and stock against the database.
  return items.filter((item) => item && typeof item === "object" && !Array.isArray(item)).slice(0, MAX_CART_ITEMS)
    .map((item) => JSON.parse(JSON.stringify(item)));
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    path: "/api/socket.io",
    cors: { origin: config.frontendOrigin, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  // Signs the socket in with the same session cookie the site uses. Guests may connect but get nothing.
  io.use(async (socket, next) => {
    try {
      const session = auth ? await auth.api.getSession({ headers: fromNodeHeaders(socket.request.headers) }) : null;
      socket.data.user = session?.user || null;
    } catch { socket.data.user = null; }
    next();
  });

  io.on("connection", async (socket) => {
    const user = socket.data.user;
    if (!user) return;
    socket.join(`user:${user.id}`);
    if (await isAdminEmail(user.email).catch(() => false)) socket.join("admins");

    const saved = await Cart.findOne({ userId: user.id }).lean().catch(() => null);
    if (saved) socket.emit("cart", { items: saved.items, updatedAt: saved.updatedAt });

    socket.on("cart:save", async (payload) => {
      const updatedAt = Number(payload?.updatedAt) || Date.now();
      const items = cleanCart(payload?.items);
      try {
        // Only a newer cart replaces the saved one (two devices editing at once: the last change wins).
        const result = await Cart.findOneAndUpdate(
          { userId: user.id, updatedAt: { $lt: updatedAt } },
          { $set: { items, updatedAt } },
          { upsert: true, returnDocument: "after" },
        ).lean();
        socket.to(`user:${user.id}`).emit("cart", { items: result.items, updatedAt: result.updatedAt });
      } catch (error) {
        if (error?.code !== 11000) console.error("Cart sync failed:", error.message);
        // 11000: a newer cart is already saved; send it back so this tab catches up.
        const current = await Cart.findOne({ userId: user.id }).lean().catch(() => null);
        if (current) socket.emit("cart", { items: current.items, updatedAt: current.updatedAt });
      }
    });
  });
  return io;
}

function publicNotification(doc) {
  return { id: String(doc._id), type: doc.type, title: doc.title, message: doc.message, link: doc.link, read: doc.read, createdAt: doc.createdAt };
}

// Saves a notification for a user and pushes it to their open tabs. Never throws: a failed
// notification must not break a payment or a delivery.
export async function notifyUser(userId, { type, title, message = "", link = "" }) {
  if (!userId) return;
  try {
    const doc = await Notification.create({ userId: String(userId), type, title, message, link });
    io?.to(`user:${userId}`).emit("notification", publicNotification(doc));
  } catch (error) { console.error("Could not send notification:", error.message); }
}

// Live-only message to every admin who has the site open (not saved).
export function notifyAdmins({ type, title, message = "", link = "/admin" }) {
  io?.to("admins").emit("notification", { id: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, title, message, link, read: false, createdAt: new Date(), live: true });
}

export async function listNotifications(userId) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    Notification.countDocuments({ userId, read: false }),
  ]);
  return { notifications: items.map(publicNotification), unread };
}

export async function markNotificationsRead(userId) {
  await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
}
