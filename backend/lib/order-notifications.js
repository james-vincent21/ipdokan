// Notifications sent when an order or a wallet changes. All calls are fire-and-forget.
import { Order } from "../models/order.model.js";
import { notifyAdmins, notifyUser } from "./realtime.js";

const money = (amount, currency) => `${currency === "BDT" ? "৳" : "$"}${Number(amount || 0).toFixed(2)}`;

// After payment: tells the customer (proxies ready, or being prepared) and every admin.
export async function notifyOrderPaid(orderId) {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order || order.status !== "paid") return;
    const pending = order.source === "myproxyapi" && order.supplierDeliveryPending;
    await notifyUser(order.userId, pending
      ? { type: "order-paid", title: "Payment received", message: `${order.productName}: your proxies are being prepared and will arrive within 3–5 minutes.`, link: "/profile" }
      : { type: "order-ready", title: "Your order is ready", message: `${order.productName} is delivered. Open your account to see it.`, link: "/profile" });
    notifyAdmins({ type: "admin-order", title: "New paid order", message: `${order.productName} · ${money(order.amount, order.currency)}` });
  } catch (error) { console.error("Order notification failed:", error.message); }
}

// When supplier proxies that were still being prepared arrive.
export async function notifyProxiesReady(orderId) {
  try {
    const order = await Order.findById(orderId).lean();
    if (order) await notifyUser(order.userId, { type: "order-ready", title: "Your proxies are ready", message: `${order.productName} is delivered. Open your account to copy the IPs.`, link: "/profile" });
  } catch (error) { console.error("Delivery notification failed:", error.message); }
}

export function notifyWalletTopup(transaction, balanceCents) {
  const added = (transaction.amountCents / 100).toFixed(2);
  const bonus = transaction.bonusCents ? ` (includes $${(transaction.bonusCents / 100).toFixed(2)} bonus)` : "";
  notifyUser(transaction.userId, { type: "wallet-topup", title: "Wallet recharged", message: `+$${added}${bonus}. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}

export function notifyWalletRefund(userId, amountCents, balanceCents) {
  notifyUser(userId, { type: "wallet-refund", title: "Refunded to your wallet", message: `$${(amountCents / 100).toFixed(2)} was returned to your wallet. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}

export function notifyWalletCredit(userId, amountCents, balanceCents, note) {
  notifyUser(userId, { type: "wallet-credit", title: "Credit added to your wallet", message: `+$${(amountCents / 100).toFixed(2)}${note ? ` · ${note}` : ""}. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}
