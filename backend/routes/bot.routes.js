// Bridge for the IPDokan Telegram bot (/opt/ipdokan on the VPS), so bot sales use this store's own
// inventory and show up in the admin panel (orders, earnings, notifications) like website sales:
//   POST /api/bot/orders              create an order for a Telegram user (reserves codes / supplier plan)
//   POST /api/bot/orders/:id/started  customer was sent to a payment page (keeps the reservation alive,
//                                     records the method so admins see how the customer is paying)
//   POST /api/bot/orders/:id/paid     payment verified by the bot -> codes sold + returned
//   POST /api/bot/orders/:id/failed   the payment failed / was cancelled -> "Payment failed", stock returned
//   POST /api/bot/orders/:id/cancel   release the reservation
//   GET  /api/bot/orders/:id          status + delivered codes (supplier orders can arrive later)
//
// Security: requires the X-Bot-Secret header (BOT_API_SECRET in .env, 32+ characters) and is only
// accepted on direct local connections (127.0.0.1:4000). Anything that came through nginx carries
// X-Real-IP / X-Forwarded-For and is refused. Cryptomus payments reported by the bot are checked
// with Cryptomus again here before the order is marked paid.
//
// This file must stay in the repository: deploys mirror the repository to the server, so a copy
// placed only on the server is removed by the next deploy.
import { Router } from "express";
import mongoose from "mongoose";
import { timingSafeEqual } from "node:crypto";
import { Order } from "../models/order.model.js";
import { ProductActivity } from "../models/product-activity.model.js";
import { cancelOrder, createOrder, fulfillPaidOrder, releaseReservedStock } from "../controllers/store.controller.js";
import { verifyCryptomusInvoice } from "../controllers/cryptomus.controller.js";
import { notifyAdmins } from "../lib/realtime.js";

const router = Router();
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

router.use((req, res, next) => {
  const secret = process.env.BOT_API_SECRET || "";
  if (secret.length < 32) return res.status(503).json({ error: "Bot bridge is not configured." });
  const proxied = req.headers["x-real-ip"] || req.headers["x-forwarded-for"];
  if (proxied || !LOOPBACK.has(req.socket?.remoteAddress || "")) return res.status(404).json({ error: "Route not found." });
  const given = Buffer.from(String(req.headers["x-bot-secret"] || ""));
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).json({ error: "Unauthorized." });
  next();
});

const telegramUser = (body) => {
  const id = String(body?.telegramId || "").replace(/\D/g, "");
  return id ? { id: `telegram:${id}`, name: String(body?.name || `Telegram ${id}`).slice(0, 80), email: `tg${id}@telegram.ipdokan.com` } : null;
};

const BOT_METHODS = ["zinipay", "cryptomus"];
const METHOD_LABEL = { zinipay: "ZiniPay", cryptomus: "Cryptomus" };
const botMethod = (value) => (BOT_METHODS.includes(value) ? value : "");
// ZiniPay reports the wallet used ("bkash", "nagad", ...).
const channelOf = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9 _-]/g, "").slice(0, 40);

const view = (order) => ({
  id: String(order._id),
  status: order.status,
  amount: order.amount,
  currency: order.currency,
  quantity: order.quantity,
  deliveredCodes: order.status === "paid" ? (order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : []) : [],
  supplierDeliveryPending: Boolean(order.supplierDeliveryPending),
  supplierError: order.supplierError || "",
  paymentFailure: order.paymentFailure || "",
});

// Create: same rules, prices, stock reservation and supplier flow as the website checkout.
router.post("/orders", (req, res, next) => {
  const user = telegramUser(req.body);
  if (!user) return res.status(400).json({ error: "telegramId is required." });
  req.user = user;
  return createOrder(req, res, next);
});

router.post("/orders/:id/started", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const holdMinutes = Math.min(180, Math.max(0, Number(req.body?.holdMinutes) || 0));
    const method = botMethod(req.body?.method);
    await Order.updateOne(
      { _id: req.params.id, status: "pending", userId: /^telegram:/ },
      { $set: {
        paymentStartedAt: new Date(),
        ...(method ? { paymentMethod: method } : {}),
        ...(holdMinutes ? { paymentHoldUntil: new Date(Date.now() + holdMinutes * 60 * 1000) } : {}),
      } },
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post("/orders/:id/paid", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const method = botMethod(req.body?.method);
    const reference = String(req.body?.reference || "").slice(0, 200);
    const channel = channelOf(req.body?.channel);
    if (!method || !reference) return res.status(400).json({ error: "method and reference are required." });
    const order = await Order.findOne({ _id: req.params.id, userId: /^telegram:/ });
    if (!order) return res.status(404).json({ error: "Order not found." });
    let fulfilError = "";
    if (order.status !== "paid") {
      // Cryptomus: the bot and the website use the same merchant, so the invoice is checked here too.
      // Only a fully paid invoice for at least this order's USD amount marks the order paid.
      if (method === "cryptomus") {
        const check = await verifyCryptomusInvoice(reference, order.currency === "USD" ? order.amount : 0);
        if (!check.ok) {
          console.error(`Bot order ${order._id}: Cryptomus check failed for ${reference}: ${check.reason}`);
          return res.status(402).json({ order: view(order), error: `Cryptomus payment not confirmed: ${check.reason}` });
        }
        await Order.updateOne({ _id: order._id }, { $set: { cryptomusOrderId: reference, cryptomusTxid: check.txid, cryptomusPayerCurrency: check.payerCurrency } });
      }
      if (method === "zinipay") await Order.updateOne({ _id: order._id }, { $set: { zinipayInvoiceId: reference, ...(channel ? { zinipayPaymentChannel: channel } : {}) } });
      try { await fulfillPaidOrder(String(order._id), { method, reference }); }
      catch (error) { fulfilError = error.message; console.error(`Bot order ${order._id} fulfilment:`, error.message); }
    }
    const fresh = await Order.findById(order._id);
    res.json({ order: view(fresh), error: fulfilError });
  } catch (error) { next(error); }
});

// The bot's gateway reported the payment as failed, cancelled or expired: the order is cancelled with the
// reason (admins see "Payment failed" and the method), and its reserved stock goes back.
router.post("/orders/:id/failed", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const method = botMethod(req.body?.method);
    const channel = channelOf(req.body?.channel);
    const reason = String(req.body?.reason || "").trim().slice(0, 200) || `${METHOD_LABEL[method] || "Payment"}: not completed`;
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: "pending", userId: /^telegram:/ },
      { $set: { status: "cancelled", paymentFailure: reason, ...(method ? { paymentMethod: method } : {}), ...(channel ? { zinipayPaymentChannel: channel } : {}) } },
      { new: true },
    );
    if (!order) {
      const existing = await Order.findOne({ _id: req.params.id, userId: /^telegram:/ });
      if (!existing) return res.status(404).json({ error: "Order not found." });
      return res.status(409).json({ order: view(existing), error: "Only pending orders can be marked failed." });
    }
    await releaseReservedStock(order);
    const units = `${order.variantName ? `${order.variantName}, ` : ""}${order.quantity || 1} unit(s) returned to stock`;
    await ProductActivity.create({ productId: String(order.productId), productName: order.productName, action: "order_cancelled", adminEmail: "telegram-bot", details: `Telegram order #${String(order._id).slice(-7)} payment failed (${reason}); ${units}` }).catch(() => {});
    notifyAdmins({ type: "admin-payment-failed", title: `${METHOD_LABEL[method] || "Telegram"} payment failed`, message: `${order.productName} · Telegram · ${reason}`, link: "/admin" }).catch(() => {});
    res.json({ order: view(order) });
  } catch (error) { next(error); }
});

// Only orders the bot created can be cancelled here.
router.post("/orders/:id/cancel", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    if (!(await Order.exists({ _id: req.params.id, userId: /^telegram:/ }))) return res.status(404).json({ error: "Order not found." });
    req.user = { id: "telegram-bot", email: "telegram-bot" };
    return cancelOrder(req, res, next);
  } catch (error) { next(error); }
});

router.get("/orders/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const order = await Order.findOne({ _id: req.params.id, userId: /^telegram:/ });
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ order: view(order) });
  } catch (error) { next(error); }
});

export default router;
