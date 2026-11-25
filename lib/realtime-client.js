// Socket.IO connection for signed-in customers: live notifications and cart sync between devices.
import { io } from "socket.io-client";
import { cartStamp, readCart, setCartSender, writeCart } from "@/lib/cart-store";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
export const NOTIFICATION_EVENT = "ipdokan-notification";
let socket = null;

export function connectRealtime() {
  if (socket) return socket;
  // WebSocket only: the API runs as several processes, and long-polling would need every request of a
  // connection to reach the same process.
  socket = io(apiUrl, { path: "/api/socket.io", withCredentials: true, transports: ["websocket"] });

  // On (re)connect, offer this browser's cart; the server keeps it only if it is newer than the saved one.
  socket.on("connect", () => {
    const stamp = cartStamp();
    if (stamp) socket.emit("cart:save", { items: readCart(), updatedAt: stamp });
  });
  // A newer cart from another tab or device replaces this one.
  socket.on("cart", (payload) => {
    if (!payload || !(Number(payload.updatedAt) > cartStamp())) return;
    try { writeCart(payload.items, { stamp: Number(payload.updatedAt), fromServer: true }); } catch { /* storage blocked */ }
  });
  socket.on("notification", (notification) => window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: notification })));
  setCartSender((items, updatedAt) => socket?.connected && socket.emit("cart:save", { items, updatedAt }));
  return socket;
}

export function disconnectRealtime() {
  setCartSender(null);
  socket?.disconnect();
  socket = null;
}
