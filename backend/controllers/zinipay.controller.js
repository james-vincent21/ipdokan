import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { Order } from "../models/order.model.js";
import { config } from "../config/env.js";
import { fulfillPaidOrder, PENDING_ORDER_EXPIRY_MS } from "./store.controller.js";
import { WalletTransaction } from "../models/wallet.model.js";
import { WalletError, completeTopup, failTopup } from "../lib/wallet.js";

class ZinipayError extends Error {}

const roundMoney = (value) => Math.round(value * 100) / 100;

async function zinipayRequest(path, body) {
  let response;
  try {
    response = await fetch(`${config.zinipayBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "zini-api-key": config.zinipayApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new ZinipayError(`ZiniPay is unreachable: ${error.message}`);
  }
  let result = {};
  try { result = await response.json(); } catch { /* ZiniPay returned a non-JSON body. */ }
  if (!response.ok) throw new ZinipayError(result?.message || `ZiniPay ${path} failed with HTTP ${response.status}.`);
  return result;
}

function invoiceIdFromPaymentUrl(paymentUrl) {
  try { return new URL(paymentUrl).pathname.split("/").filter(Boolean).pop() || ""; }
  catch { return ""; }
}

function readOrderIds(body) {
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds : (body?.orderId ? [body.orderId] : []);
  if (!orderIds.length || orderIds.length > 100 || orderIds.some((id) => !mongoose.isValidObjectId(id))) return null;
  return [...new Set(orderIds.map(String))];
}

export async function createZinipayInvoice(req, res, next) {
  try {
    if (!config.zinipayApiKey) return res.status(503).json({ error: "ZiniPay is not configured on the server." });
    const orderIds = readOrderIds(req.body);
    if (!orderIds) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" });
    if (orders.length !== orderIds.length) return res.status(404).json({ error: "One or more pending orders were not found." });
    if (orders.some((order) => order.currency !== "BDT")) return res.status(400).json({ error: "ZiniPay accepts payment in BDT only. Switch the currency to BDT and place the order again." });
    if (orders.some((order) => order.createdAt < new Date(Date.now() - PENDING_ORDER_EXPIRY_MS))) return res.status(409).json({ error: "This order has expired. Please place the order again." });
    const total = roundMoney(orders.reduce((sum, order) => sum + order.amount, 0));
    if (!(total > 0)) return res.status(400).json({ error: "The order total must be greater than zero." });

    const valId = `IPD${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
    await Order.updateMany({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" }, { $set: { zinipayValId: valId, zinipayInvoiceId: "", paymentStartedAt: new Date() } });

    const joinedIds = orderIds.join(",");
    const result = await zinipayRequest("/v1/payment/create", {
      cus_name: req.user.name || req.user.email || "Customer",
      cus_email: req.user.email || "",
      amount: total,
      // ZiniPay limits metadata to 1 KB; the val_id is what links the payment back to these orders.
      metadata: joinedIds.length <= 800 ? { order_ids: joinedIds, user_id: String(req.user.id) } : { user_id: String(req.user.id) },
      redirect_url: `${config.frontendOrigin}/profile?payment=zinipay&orderIds=${encodeURIComponent(joinedIds)}`,
      cancel_url: `${config.frontendOrigin}/checkout?payment=cancelled`,
      val_id: valId,
      webhook_url: `${config.authUrl}/api/payments/zinipay/webhook`,
    });
    if (!result?.status || typeof result.payment_url !== "string") throw new ZinipayError(result?.message || "ZiniPay did not return a payment URL.");

    await Order.updateMany({ zinipayValId: valId }, { $set: { zinipayInvoiceId: invoiceIdFromPaymentUrl(result.payment_url) } });
    console.log(`ZiniPay invoice created: val_id=${valId} amount=${total} BDT orders=${joinedIds}`);
    res.json({ url: result.payment_url });
  } catch (error) {
    if (error instanceof ZinipayError) {
      console.error("ZiniPay create invoice failed:", error.message);
      return res.status(502).json({ error: "Could not start the ZiniPay payment. Please try again." });
    }
    next(error);
  }
}

// Asks ZiniPay for the real payment status. A webhook or redirect alone is never trusted.
async function verifyWithZinipay(valId, invoiceIds) {
  let lastError;
  for (const invoiceId of [...new Set(invoiceIds.filter(Boolean))]) {
    try {
      const result = await zinipayRequest("/v1/payment/verify", { invoice_id: invoiceId });
      if (result && (result.status || result.val_id)) return result;
    } catch (error) { lastError = error; }
  }
  if (lastError) throw lastError;
  return null;
}

async function settleZinipayPayment(valId, extraInvoiceId = "") {
  const orders = await Order.find({ zinipayValId: valId });
  if (!orders.length) return "UNKNOWN";
  if (orders.every((order) => order.status === "paid")) return "COMPLETED";

  const storedInvoiceId = orders.find((order) => order.zinipayInvoiceId)?.zinipayInvoiceId || "";
  const result = await verifyWithZinipay(valId, [storedInvoiceId, valId, extraInvoiceId]);
  const status = String(result?.status || "PENDING").toUpperCase();
  if (status !== "COMPLETED") return status;

  // The verified invoice must belong to this checkout and cover its full amount.
  if (String(result.val_id || "") !== valId) {
    console.error(`ZiniPay verify mismatch: expected val_id=${valId}, got ${result.val_id}`);
    return "MISMATCH";
  }
  const expected = roundMoney(orders.reduce((sum, order) => sum + order.amount, 0));
  if (!(Number(result.amount) + 0.009 >= expected)) {
    console.error(`ZiniPay amount mismatch for val_id=${valId}: paid ${result.amount}, expected ${expected}`);
    return "MISMATCH";
  }

  for (const order of orders) {
    if (order.status === "paid") continue;
    if (order.status === "cancelled") {
      console.error(`ZiniPay payment ${valId} completed for cancelled order ${order._id}; review and refund or deliver manually.`);
      continue;
    }
    try { await fulfillPaidOrder(String(order._id), { method: "zinipay", reference: valId }); }
    catch (error) { console.error(`ZiniPay fulfillment failed for order ${order._id}:`, error.message); }
  }
  await Order.updateMany({ zinipayValId: valId }, { $set: {
    zinipayTransactionId: String(result.transaction_id || ""),
    zinipayPaymentChannel: String(result.payment_method || ""),
    ...(result.invoice_id ? { zinipayInvoiceId: String(result.invoice_id) } : {}),
  } });
  console.log(`ZiniPay payment completed: val_id=${valId} transaction=${result.transaction_id || "-"}`);
  return "COMPLETED";
}

// ZiniPay calls this after a payment, with the data in the JSON body or the query string.
export async function zinipayWebhook(req, res) {
  try {
    if (!config.zinipayApiKey) return res.status(503).json({ error: "ZiniPay is not configured." });
    const input = { ...(req.query || {}), ...(req.body && typeof req.body === "object" ? req.body : {}) };
    const valId = typeof input.val_id === "string" ? input.val_id.trim() : "";
    const invoiceId = typeof input.invoice_id === "string" ? input.invoice_id.trim() : "";
    let order = valId ? await Order.findOne({ zinipayValId: valId }, { zinipayValId: 1 }).lean() : null;
    if (!order && invoiceId) order = await Order.findOne({ zinipayInvoiceId: invoiceId }, { zinipayValId: 1 }).lean();
    if (!order?.zinipayValId) {
      // Not an order: it may be a wallet top-up.
      const topup = valId ? await WalletTransaction.findOne({ zinipayValId: valId }) : invoiceId ? await WalletTransaction.findOne({ zinipayInvoiceId: invoiceId }) : null;
      if (topup) return res.json({ received: true, status: await settleZinipayTopup(topup, invoiceId) });
      return res.status(404).json({ error: "Unknown ZiniPay invoice." });
    }
    const status = await settleZinipayPayment(order.zinipayValId, invoiceId);
    res.json({ received: true, status });
  } catch (error) {
    console.error("ZiniPay webhook failed:", error.message);
    res.status(500).json({ error: "Could not process the ZiniPay webhook." });
  }
}

// Called by the profile page when the customer returns from ZiniPay, in case the webhook is late.
export async function confirmZinipayPayment(req, res, next) {
  try {
    if (!config.zinipayApiKey) return res.status(503).json({ error: "ZiniPay is not configured on the server." });
    const orderIds = readOrderIds(req.body);
    if (!orderIds) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id }, { zinipayValId: 1 }).lean();
    const valIds = [...new Set(orders.map((order) => order.zinipayValId).filter(Boolean))];
    for (const valId of valIds) {
      try { await settleZinipayPayment(valId); }
      catch (error) { console.error(`ZiniPay confirm failed for val_id=${valId}:`, error.message); }
    }
    const updated = await Order.find({ _id: { $in: orderIds }, userId: req.user.id }, { status: 1 }).lean();
    res.json({ orders: updated.map((order) => ({ id: String(order._id), status: order.status })) });
  } catch (error) { next(error); }
}

// ----- Wallet top-ups (paid in BDT) -----

// Creates the ZiniPay invoice for a pending top-up and returns the payment page URL.
export async function startZinipayTopup(transaction, user) {
  if (!config.zinipayApiKey) throw new WalletError("ZiniPay is not configured on the server.", 503);
  const valId = `IPW${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString("hex").toUpperCase()}`;
  await WalletTransaction.updateOne({ _id: transaction._id }, { $set: { zinipayValId: valId } });
  const back = `${config.frontendOrigin}/wallet?topup=${transaction._id}`;
  try {
    const result = await zinipayRequest("/v1/payment/create", {
      cus_name: user.name || user.email || "Customer",
      cus_email: user.email || "",
      amount: transaction.paidAmount,
      metadata: { wallet_topup: String(transaction._id), user_id: String(user.id) },
      redirect_url: `${back}&payment=zinipay`,
      cancel_url: `${back}&payment=cancelled`,
      val_id: valId,
      webhook_url: `${config.authUrl}/api/payments/zinipay/webhook`,
    });
    if (!result?.status || typeof result.payment_url !== "string") throw new ZinipayError(result?.message || "ZiniPay did not return a payment URL.");
    await WalletTransaction.updateOne({ _id: transaction._id }, { $set: { zinipayInvoiceId: invoiceIdFromPaymentUrl(result.payment_url) } });
    console.log(`ZiniPay wallet top-up created: val_id=${valId} amount=${transaction.paidAmount} BDT topup=${transaction._id}`);
    return result.payment_url;
  } catch (error) {
    if (!(error instanceof ZinipayError)) throw error;
    console.error("ZiniPay top-up invoice failed:", error.message);
    await failTopup(transaction._id, "Could not start the ZiniPay payment.");
    throw new WalletError("Could not start the ZiniPay payment. Please try again.", 502);
  }
}

// Checks the top-up with ZiniPay and credits the wallet once the full amount is paid.
export async function settleZinipayTopup(transaction, extraInvoiceId = "") {
  if (transaction.status !== "pending") return transaction.status;
  const result = await verifyWithZinipay(transaction.zinipayValId, [transaction.zinipayInvoiceId, transaction.zinipayValId, extraInvoiceId]);
  const status = String(result?.status || "PENDING").toUpperCase();
  if (["FAILED", "CANCELLED", "CANCELED", "EXPIRED"].includes(status)) {
    await failTopup(transaction._id, `ZiniPay status: ${status}`);
    return "failed";
  }
  if (status !== "COMPLETED") return "pending";
  if (String(result.val_id || "") !== transaction.zinipayValId || !(Number(result.amount) + 0.009 >= transaction.paidAmount)) {
    console.error(`ZiniPay top-up mismatch for ${transaction._id}: val_id=${result.val_id} amount=${result.amount}, expected ${transaction.zinipayValId} / ${transaction.paidAmount} BDT`);
    return "pending";
  }
  await completeTopup(transaction._id, {
    zinipayTransactionId: String(result.transaction_id || ""),
    ...(result.invoice_id ? { zinipayInvoiceId: String(result.invoice_id) } : {}),
  });
  return "completed";
}
