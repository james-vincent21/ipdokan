import mongoose from "mongoose";
import { Coupon } from "../models/coupon.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";

const roundMoney = (value) => Math.round(value * 100) / 100;
const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;
// A checkout id is made by the browser for one "Buy now" or one cart, so a cart paid together counts as one coupon use.
const CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export class CouponError extends Error {}

export const normalizeCouponCode = (value) => (typeof value === "string" ? value.trim().toUpperCase() : "");
export const validCheckoutId = (value) => typeof value === "string" && CHECKOUT_ID_PATTERN.test(value);

const appliesTo = (coupon, productId) => !coupon.productIds?.length || coupon.productIds.some((id) => String(id) === String(productId));

function publicCoupon(coupon) {
  return { code: coupon.code, type: coupon.type, percent: coupon.percent, amountUsd: coupon.amountUsd, amountBdt: coupon.amountBdt, productIds: (coupon.productIds || []).map(String) };
}

// Throws CouponError with a message for the customer when the coupon cannot be used.
// Orders already placed in the same checkout do not count against the limits.
async function usableCoupon(code, userId, checkoutId = "") {
  const normalized = normalizeCouponCode(code);
  if (!normalized) throw new CouponError("Enter a coupon code.");
  const coupon = await Coupon.findOne({ code: normalized }).lean();
  if (!coupon || !coupon.active) throw new CouponError("This coupon code is not valid.");
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) throw new CouponError("This coupon has expired.");
  const otherCheckouts = { couponId: coupon._id, status: { $ne: "cancelled" }, ...(checkoutId ? { checkoutId: { $ne: checkoutId } } : {}) };
  if (coupon.onePerUser && userId && await Order.exists({ ...otherCheckouts, userId })) throw new CouponError("You have already used this coupon.");
  if (coupon.maxUses > 0) {
    const used = (await Order.distinct("checkoutId", otherCheckouts)).length;
    if (used >= coupon.maxUses) throw new CouponError("This coupon has reached its usage limit.");
  }
  return coupon;
}

// The discount for one order. `subtotal` is the product price × quantity in `currency`.
// Returns no discount (and no coupon) for a product the coupon does not cover, so the rest of a cart still gets it.
// A fixed-amount coupon is spread over the orders of one checkout until it is used up.
// The order always keeps at least 1% of its price, so no payment is ever zero.
export async function orderDiscount({ code, checkoutId, userId, currency, subtotal, productId }) {
  const coupon = await usableCoupon(code, userId, checkoutId);
  if (!appliesTo(coupon, productId)) return { couponId: null, couponCode: "", discount: 0 };
  let discount;
  if (coupon.type === "percent") discount = roundMoney(subtotal * coupon.percent / 100);
  else {
    const fixed = currency === "BDT" ? coupon.amountBdt : coupon.amountUsd;
    if (!(fixed > 0)) throw new CouponError(`This coupon cannot be used when paying in ${currency}.`);
    const [given] = await Order.aggregate([{ $match: { userId, checkoutId, couponId: coupon._id, status: { $ne: "cancelled" } } }, { $group: { _id: null, total: { $sum: "$discount" } } }]);
    discount = roundMoney(Math.max(0, fixed - (given?.total || 0)));
  }
  discount = Math.min(discount, roundMoney(subtotal * 0.99));
  return { couponId: coupon._id, couponCode: coupon.code, discount: Math.max(0, discount) };
}

// POST /api/coupons/check  { code, productIds }  → the coupon's terms, so the checkout can show the discounted total.
// `productIds`: the products being bought; the coupon must cover at least one of them.
export async function checkCoupon(req, res, next) {
  try {
    const coupon = await usableCoupon(req.body?.code, req.user?.id || "");
    const productIds = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : [];
    if (productIds.length && !productIds.some((id) => appliesTo(coupon, id))) throw new CouponError(productIds.length === 1 ? "This coupon does not work for this product." : "This coupon does not work for any product in your cart.");
    res.json({ coupon: publicCoupon(coupon) });
  } catch (error) {
    if (error instanceof CouponError) return res.status(400).json({ error: error.message });
    next(error);
  }
}

function couponInput(body) {
  const code = normalizeCouponCode(body?.code);
  if (!CODE_PATTERN.test(code)) throw new CouponError("Coupon code must be 3–40 letters, numbers, - or _.");
  const type = body?.type === "fixed" ? "fixed" : "percent";
  const percent = type === "percent" ? Number(body?.percent) : 0;
  const amountUsd = type === "fixed" ? Number(body?.amountUsd || 0) : 0;
  const amountBdt = type === "fixed" ? Number(body?.amountBdt || 0) : 0;
  if (type === "percent" && !(Number.isFinite(percent) && percent >= 1 && percent <= 99)) throw new CouponError("Percent discount must be from 1 to 99.");
  if (type === "fixed" && !(Number.isFinite(amountUsd) && Number.isFinite(amountBdt) && amountUsd >= 0 && amountBdt >= 0 && (amountUsd > 0 || amountBdt > 0))) throw new CouponError("Enter a USD amount, a BDT amount, or both.");
  const maxUses = body?.maxUses === "" || body?.maxUses === undefined ? 0 : Number(body.maxUses);
  if (!Number.isInteger(maxUses) || maxUses < 0) throw new CouponError("Usage limit must be a whole number (0 or empty for no limit).");
  let expiresAt = null;
  if (body?.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new CouponError("Expiry date is not valid.");
  }
  const productIds = [...new Set((Array.isArray(body?.productIds) ? body.productIds : []).map(String))];
  if (productIds.some((id) => !mongoose.isValidObjectId(id))) throw new CouponError("One of the chosen products is not valid.");
  return { code, type, percent, amountUsd: roundMoney(amountUsd), amountBdt: roundMoney(amountBdt), maxUses, expiresAt, onePerUser: body?.onePerUser !== false, active: body?.active !== false, productIds };
}

async function withUsage(coupons) {
  const ids = coupons.map((coupon) => coupon._id);
  const usage = await Order.aggregate([
    { $match: { couponId: { $in: ids }, status: { $ne: "cancelled" } } },
    { $group: { _id: { couponId: "$couponId", checkoutId: "$checkoutId" }, paid: { $max: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } }, discount: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$discount", 0] } }, currency: { $first: "$currency" } } },
    { $group: { _id: "$_id.couponId", uses: { $sum: 1 }, paidUses: { $sum: "$paid" }, discountUsd: { $sum: { $cond: [{ $eq: ["$currency", "USD"] }, "$discount", 0] } }, discountBdt: { $sum: { $cond: [{ $eq: ["$currency", "BDT"] }, "$discount", 0] } } } },
  ]);
  const byId = new Map(usage.map((row) => [String(row._id), row]));
  return coupons.map((coupon) => {
    const row = byId.get(String(coupon._id));
    return { id: String(coupon._id), ...publicCoupon(coupon), active: coupon.active, expiresAt: coupon.expiresAt, maxUses: coupon.maxUses, onePerUser: coupon.onePerUser, createdAt: coupon.createdAt, uses: row?.uses || 0, paidUses: row?.paidUses || 0, discountUsd: roundMoney(row?.discountUsd || 0), discountBdt: roundMoney(row?.discountBdt || 0) };
  });
}

export async function listCoupons(_req, res, next) {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.json({ coupons: await withUsage(coupons) });
  } catch (error) { next(error); }
}

export async function createCoupon(req, res, next) {
  try {
    const input = couponInput(req.body);
    if (await Coupon.exists({ code: input.code })) return res.status(409).json({ error: `A coupon named ${input.code} already exists.` });
    if (input.productIds.length && await Product.countDocuments({ _id: { $in: input.productIds } }) !== input.productIds.length) return res.status(400).json({ error: "One of the chosen products no longer exists. Refresh and try again." });
    const coupon = await Coupon.create({ ...input, createdBy: String(req.user.email || "").toLowerCase() });
    res.status(201).json({ coupon: (await withUsage([coupon.toObject()]))[0] });
  } catch (error) {
    if (error instanceof CouponError) return res.status(400).json({ error: error.message });
    next(error);
  }
}

// PATCH with { active } only turns a coupon on or off.
export async function updateCoupon(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid coupon id." });
    if (typeof req.body?.active !== "boolean") return res.status(400).json({ error: "Send active: true or false." });
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, { $set: { active: req.body.active } }, { new: true }).lean();
    if (!coupon) return res.status(404).json({ error: "Coupon not found." });
    res.json({ coupon: (await withUsage([coupon]))[0] });
  } catch (error) { next(error); }
}

// GET /admin/coupons/:id/orders → every order that used the coupon: who bought what, the discount, and whether it was paid.
export async function couponOrders(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid coupon id." });
    const orders = await Order.find({ couponId: req.params.id }).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ orders: orders.map((order) => ({ id: String(order._id), invoiceId: order.invoiceId, userId: order.userId, userName: order.userName, userEmail: order.userEmail, productName: order.productName, variantName: order.variantName, quantity: order.quantity, currency: order.currency, subtotal: order.subtotal, discount: order.discount, amount: order.amount, status: order.status, paymentMethod: order.paymentMethod, createdAt: order.createdAt, paidAt: order.paidAt })) });
  } catch (error) { next(error); }
}

export async function deleteCoupon(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid coupon id." });
    const deleted = await Coupon.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Coupon not found." });
    res.json({ deleted: true });
  } catch (error) { next(error); }
}
