// Notifications sent when an order or a wallet changes. All calls are fire-and-forget.
import mongoose from "mongoose";
import { Order } from "../models/order.model.js";
import { notifyAdmins, notifyUser } from "./realtime.js";

const money = (amount, currency) => `${currency === "BDT" ? "৳" : "$"}${Number(amount || 0).toFixed(2)}`;
const METHOD_LABEL = { cryptomus: "Cryptomus", zinipay: "ZiniPay", wallet: "Wallet", stripe: "Card (Stripe)", demo: "Demo", admin: "Admin" };

// "via Cryptomus (USDT)", "via ZiniPay", or "" when the method is not known.
function via(method, payerCurrency) {
  const label = METHOD_LABEL[method] || method;
  return label ? ` · via ${label}${payerCurrency ? ` (${payerCurrency})` : ""}` : "";
}

async function customerEmail(userId) {
  try {
    const user = await mongoose.connection.collection("user").findOne({ _id: new mongoose.Types.ObjectId(String(userId)) }, { projection: { email: 1 } });
    return user?.email || "";
  } catch { return ""; }
}

// After payment: tells the customer (proxies ready, or being prepared) and every admin.
export async function notifyOrderPaid(orderId) {
  try {
    const order = await Order.findById(orderId).lean();
    if (!order || order.status !== "paid") return;
    const pending = order.source === "myproxyapi" && order.supplierDeliveryPending;
    await notifyUser(order.userId, pending
      ? { type: "order-paid", title: "Payment received", message: `${order.productName}: your proxies are being prepared and will arrive within 3–5 minutes.`, link: "/profile" }
      : { type: "order-ready", title: "Your order is ready", message: `${order.productName} is delivered. Open your account to see it.`, link: "/profile" });
    notifyAdmins({ type: "admin-order", title: order.paymentMethod === "cryptomus" ? "Cryptomus payment received" : "New paid order", message: `${order.productName} · ${money(order.amount, order.currency)}${via(order.paymentMethod, order.cryptomusPayerCurrency)}${order.userEmail ? ` · ${order.userEmail}` : ""}`, link: "/admin" });
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
  customerEmail(transaction.userId).then((email) => notifyAdmins({
    type: "admin-topup",
    title: transaction.method === "cryptomus" ? "Cryptomus wallet recharge" : "Wallet recharge",
    message: `${money(transaction.paidAmount, transaction.paidCurrency)} paid → +$${added} credited${via(transaction.method)}${email ? ` · ${email}` : ""}`,
    link: "/admin",
  }));
}

export function notifyWalletRefund(userId, amountCents, balanceCents) {
  notifyUser(userId, { type: "wallet-refund", title: "Refunded to your wallet", message: `$${(amountCents / 100).toFixed(2)} was returned to your wallet. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}

export function notifyWalletCredit(userId, amountCents, balanceCents, note) {
  notifyUser(userId, { type: "wallet-credit", title: "Credit added to your wallet", message: `+$${(amountCents / 100).toFixed(2)}${note ? ` · ${note}` : ""}. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}

export function notifyWalletDebit(userId, amountCents, balanceCents, note) {
  notifyUser(userId, { type: "wallet-debit", title: "Credit taken back from your wallet", message: `-$${(amountCents / 100).toFixed(2)}${note ? ` · ${note}` : ""}. Balance: $${(balanceCents / 100).toFixed(2)}.`, link: "/wallet" });
}
