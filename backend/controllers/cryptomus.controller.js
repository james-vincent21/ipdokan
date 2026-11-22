import mongoose from "mongoose";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Order } from "../models/order.model.js";
import { config } from "../config/env.js";
import { fulfillPaidOrder, PENDING_ORDER_EXPIRY_MS } from "./store.controller.js";

// Docs: https://doc.cryptomus.com/merchant-api
const CRYPTOMUS_API = "https://api.cryptomus.com";
const INVOICE_LIFETIME_SECONDS = 60 * 60;
// Blockchain confirmations can take a while after the customer sends funds.
const ORDER_HOLD_MS = 2 * 60 * 60 * 1000;
const SUCCESS_STATUSES = new Set(["paid", "paid_over"]);

class CryptomusError extends Error {}

const roundMoney = (value) => Math.round(value * 100) / 100;

// Cryptomus signs PHP json_encode output, which escapes "/" as "\/".
function phpJson(value) {
  return JSON.stringify(value).replace(/\//g, "\\/");
}

function signOf(json) {
  return createHash("md5").update(Buffer.from(json).toString("base64") + config.cryptomusPaymentKey).digest("hex");
}

async function cryptomusRequest(path, body) {
  const json = phpJson(body);
  let response;
  try {
    response = await fetch(`${CRYPTOMUS_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", merchant: config.cryptomusMerchantId, sign: signOf(json) },
      body: json,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new CryptomusError(`Cryptomus is unreachable: ${error.message}`);
  }
  let result = {};
  try { result = await response.json(); } catch { /* Non-JSON body. */ }
  if (!response.ok || result?.state !== 0 || !result.result) {
    const detail = result?.message || (result?.errors ? JSON.stringify(result.errors) : `HTTP ${response.status}`);
    throw new CryptomusError(`Cryptomus ${path} failed: ${detail}`);
  }
  return result.result;
}

function readOrderIds(body) {
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds : (body?.orderId ? [body.orderId] : []);
  if (!orderIds.length || orderIds.length > 100 || orderIds.some((id) => !mongoose.isValidObjectId(id))) return null;
  return [...new Set(orderIds.map(String))];
}

export async function createCryptomusInvoice(req, res, next) {
  try {
    if (!config.cryptomusEnabled) return res.status(503).json({ error: "Cryptomus is not configured on the server." });
    const orderIds = readOrderIds(req.body);
    if (!orderIds) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" });
    if (orders.length !== orderIds.length) return res.status(404).json({ error: "One or more pending orders were not found." });
    if (orders.some((order) => order.currency !== "USD")) return res.status(400).json({ error: "Cryptomus payments are made in USD. Choose Cryptomus before placing the order." });
    if (orders.some((order) => order.createdAt < new Date(Date.now() - PENDING_ORDER_EXPIRY_MS))) return res.status(409).json({ error: "This order has expired. Please place the order again." });
    const total = roundMoney(orders.reduce((sum, order) => sum + order.amount, 0));
    if (!(total > 0)) return res.status(400).json({ error: "The order total must be greater than zero." });

    const cryptomusOrderId = `ipd_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
    await Order.updateMany({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" }, { $set: {
      cryptomusOrderId, cryptomusUuid: "", paymentStartedAt: new Date(), paymentHoldUntil: new Date(Date.now() + ORDER_HOLD_MS),
    } });

    const joinedIds = orderIds.join(",");
    const invoice = await cryptomusRequest("/v1/payment", {
      amount: total.toFixed(2),
      currency: "USD",
      order_id: cryptomusOrderId,
      url_return: `${config.frontendOrigin}/checkout?payment=cancelled`,
      url_success: `${config.frontendOrigin}/profile?payment=cryptomus&orderIds=${encodeURIComponent(joinedIds)}`,
      url_callback: `${config.authUrl}/api/payments/cryptomus/webhook`,
      lifetime: INVOICE_LIFETIME_SECONDS,
      ...(joinedIds.length <= 255 ? { additional_data: joinedIds } : {}),
    });
    if (typeof invoice.url !== "string") throw new CryptomusError("Cryptomus did not return a payment URL.");

    await Order.updateMany({ cryptomusOrderId }, { $set: { cryptomusUuid: String(invoice.uuid || "") } });
    console.log(`Cryptomus invoice created: order_id=${cryptomusOrderId} amount=${total} USD orders=${joinedIds}`);
    res.json({ url: invoice.url });
  } catch (error) {
    if (error instanceof CryptomusError) {
      console.error("Cryptomus create invoice failed:", error.message);
      return res.status(502).json({ error: "Could not start the Cryptomus payment. Please try again." });
    }
    next(error);
  }
}

// Asks Cryptomus for the real invoice status. A webhook or redirect alone is never trusted.
async function settleCryptomusPayment(cryptomusOrderId) {
  const orders = await Order.find({ cryptomusOrderId });
  if (!orders.length) return "unknown";
  if (orders.every((order) => order.status === "paid")) return "paid";

  const invoice = await cryptomusRequest("/v1/payment/info", { order_id: cryptomusOrderId });
  const status = String(invoice.payment_status || invoice.status || "").toLowerCase();
  if (!SUCCESS_STATUSES.has(status)) return status || "check";

  // The verified invoice must belong to this checkout and cover its full amount.
  const expected = roundMoney(orders.reduce((sum, order) => sum + order.amount, 0));
  if (String(invoice.order_id) !== cryptomusOrderId || String(invoice.currency).toUpperCase() !== "USD" || !(Number(invoice.amount) + 0.009 >= expected)) {
    console.error(`Cryptomus mismatch for order_id=${cryptomusOrderId}: got order_id=${invoice.order_id} amount=${invoice.amount} ${invoice.currency}, expected ${expected} USD`);
    return "mismatch";
  }

  for (const order of orders) {
    if (order.status === "paid") continue;
    if (order.status === "cancelled") {
      console.error(`Cryptomus payment ${cryptomusOrderId} completed for cancelled order ${order._id}; review and refund or deliver manually.`);
      continue;
    }
    try { await fulfillPaidOrder(String(order._id), { method: "cryptomus", reference: cryptomusOrderId }); }
    catch (error) { console.error(`Cryptomus fulfillment failed for order ${order._id}:`, error.message); }
  }
  await Order.updateMany({ cryptomusOrderId }, { $set: {
    cryptomusTxid: String(invoice.txid || ""),
    cryptomusPayerCurrency: String(invoice.payer_currency || ""),
    ...(invoice.uuid ? { cryptomusUuid: String(invoice.uuid) } : {}),
  } });
  console.log(`Cryptomus payment completed: order_id=${cryptomusOrderId} status=${status} payer=${invoice.payer_currency || "-"} txid=${invoice.txid || "-"}`);
  return status;
}

function webhookSignatureValid(body) {
  if (!body || typeof body.sign !== "string") return false;
  const { sign, ...data } = body;
  const expected = signOf(phpJson(data));
  return sign.length === expected.length && timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
}

// Cryptomus POSTs here whenever an invoice status changes.
export async function cryptomusWebhook(req, res) {
  try {
    if (!config.cryptomusEnabled) return res.status(503).json({ error: "Cryptomus is not configured." });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    // The status is always re-checked with Cryptomus below, so a bad signature is logged rather than trusted.
    if (!webhookSignatureValid(body)) console.warn(`Cryptomus webhook signature mismatch for order_id=${body.order_id} from ${req.ip}`);
    const cryptomusOrderId = typeof body.order_id === "string" ? body.order_id : "";
    if (!cryptomusOrderId || !(await Order.exists({ cryptomusOrderId }))) return res.status(404).json({ error: "Unknown Cryptomus order." });
    const status = await settleCryptomusPayment(cryptomusOrderId);
    res.json({ received: true, status });
  } catch (error) {
    console.error("Cryptomus webhook failed:", error.message);
    res.status(500).json({ error: "Could not process the Cryptomus webhook." });
  }
}

// Called by the profile page when the customer returns from Cryptomus, in case the webhook is late.
export async function confirmCryptomusPayment(req, res, next) {
  try {
    if (!config.cryptomusEnabled) return res.status(503).json({ error: "Cryptomus is not configured on the server." });
    const orderIds = readOrderIds(req.body);
    if (!orderIds) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id }, { cryptomusOrderId: 1 }).lean();
    for (const cryptomusOrderId of new Set(orders.map((order) => order.cryptomusOrderId).filter(Boolean))) {
      try { await settleCryptomusPayment(cryptomusOrderId); }
      catch (error) { console.error(`Cryptomus confirm failed for order_id=${cryptomusOrderId}:`, error.message); }
    }
    const updated = await Order.find({ _id: { $in: orderIds }, userId: req.user.id }, { status: 1 }).lean();
    res.json({ orders: updated.map((order) => ({ id: String(order._id), status: order.status })) });
  } catch (error) { next(error); }
}
