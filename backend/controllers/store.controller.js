import mongoose from "mongoose";
import Stripe from "stripe";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { AdminEmail } from "../models/admin-email.model.js";
import { ProductActivity } from "../models/product-activity.model.js";
import { config } from "../config/env.js";
import { SUPPLIER_CATEGORIES, SupplierError, availableBalanceUsd, categoryLocations, getPrice, isIpv4, supplierConfigured } from "../lib/myproxyapi.js";
import { SUPPLIER_MAX_QUANTITY, fulfillSupplierOrder, lowestSetPrice, supplierVariantsInput } from "./supplier.controller.js";
import { withServiceFee } from "../utils/service-fee.js";
import { notifyOrderPaid } from "../lib/order-notifications.js";
import { CouponError, normalizeCouponCode, orderDiscount, validCheckoutId } from "./coupon.controller.js";

function parseCodeList(input) {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(/\r?\n/) : [];
  return list.filter((code) => typeof code === "string").map((code) => code.trim()).filter(Boolean);
}

function findDuplicateCode(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return "";
}

// A code may never be sold twice: it is "used" if any product holds it (available, reserved, or sold)
// or any order has already delivered it, even after its variant or product was deleted.
async function findUsedCode(codes) {
  const list = [...new Set(codes)];
  if (!list.length) return "";
  const [product, order] = await Promise.all([
    Product.findOne({ $or: [{ "codes.value": { $in: list } }, { "variants.codes.value": { $in: list } }, { "variants.secretCode": { $in: list } }] }, { codes: 1, variants: 1 }).lean(),
    Order.findOne({ $or: [{ deliveredCodes: { $in: list } }, { deliveredCode: { $in: list } }] }, { deliveredCodes: 1, deliveredCode: 1 }).lean(),
  ]);
  const used = new Set([
    ...(product?.codes || []).map((code) => code.value),
    ...(product?.variants || []).flatMap((variant) => [...(variant.codes || []).map((code) => code.value), variant.secretCode]),
    ...(order?.deliveredCodes || []),
    order?.deliveredCode,
  ].filter(Boolean));
  return list.find((code) => used.has(code)) || "";
}

const usedCodeMessage = (code) => `The code "${code}" has already been added or sold before. Each code can only be used once.`;

// Order price fields: the product price, less any coupon discount, plus the service fee; `amount` is what the gateway charges.
function orderCharge(productTotal, discount = 0) {
  const subtotal = withServiceFee(productTotal).subtotal;
  const { serviceFee, total } = withServiceFee(subtotal - discount);
  return { subtotal, discount, serviceFee, serviceFeePercent: config.serviceFeePercent, amount: total };
}

// Price fields for a new order, with the coupon from the request applied (if any).
// Throws CouponError when the buyer entered a coupon that cannot be used.
async function chargeWithCoupon(req, productTotal, currency, productId) {
  const checkoutId = validCheckoutId(req.body?.checkoutId) ? req.body.checkoutId : "";
  const code = normalizeCouponCode(req.body?.couponCode);
  if (!code) return { ...orderCharge(productTotal), checkoutId };
  if (!checkoutId) throw new CouponError("Refresh the page and apply the coupon again.");
  const subtotal = withServiceFee(productTotal).subtotal;
  const { couponId, couponCode, discount } = await orderDiscount({ code, checkoutId, userId: String(req.user.id), currency, subtotal, productId });
  return { ...orderCharge(productTotal, discount), couponId, couponCode, checkoutId };
}

function getInvoiceId(order) {
  if (order.invoiceId) return order.invoiceId;
  const date = new Date(order.createdAt || Date.now());
  const datePart = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return `IPD-${datePart}-${String(order._id).toUpperCase()}`;
}

// `locationOptions`: the supplier cities a buyer can pick for plans without a fixed location.
function publicProduct(product, locationOptions = []) {
  // Supplier products have no local stock: each plan can be bought up to SUPPLIER_MAX_QUANTITY at a time.
  const fromSupplier = product.source === "myproxyapi";
  const variants = (product.variants || []).map((variant) => ({
    id: variant._id,
    name: variant.name,
    price: variant.price,
    priceUsd: variant.priceUsd ?? variant.price,
    priceBdt: variant.priceBdt ?? 0,
    available: fromSupplier
      ? (supplierConfigured() ? SUPPLIER_MAX_QUANTITY : 0)
      : variant.stockQuantity !== null && variant.stockQuantity !== undefined
        ? variant.stockQuantity
        : variant.codes.filter((item) => item.status === "available").length,
    // A price of 0 in a currency means the admin has not set it: buyers paying in that currency are
    // asked to contact the admin. priceOnRequest: no price is set in either currency.
    ...(fromSupplier ? { ips: variant.supplier?.ips || 1, chooseLocation: !variant.supplier?.locations, priceOnRequest: !(variant.priceUsd > 0) && !(variant.priceBdt > 0) } : {}),
  }));
  const available = variants.length ? variants.reduce((sum, variant) => sum + variant.available, 0) : product.codes.filter((item) => item.status === "available").length;
  return {
    id: product._id,
    name: product.name,
    description: product.description,
    codeNumber: product.codeNumber,
    imageUrl: product.imageUrl,
    category: product.category,
    brand: product.brand || "",
    discountPercent: product.discountPercent || 0,
    rating: product.rating || 0,
    reviewCount: product.reviewCount || 0,
    showInPopular: Boolean(product.showInPopular),
    popularOrder: product.popularOrder || 0,
    price: fromSupplier ? lowestSetPrice(variants, "priceUsd") : variants.length ? Math.min(...variants.map((variant) => variant.price)) : product.price,
    priceUsd: fromSupplier ? lowestSetPrice(variants, "priceUsd") : variants.length ? Math.min(...variants.map((variant) => variant.priceUsd ?? variant.price)) : (product.priceUsd ?? product.price),
    priceBdt: fromSupplier ? lowestSetPrice(variants, "priceBdt") : variants.length ? Math.min(...variants.map((variant) => variant.priceBdt ?? 0)) : (product.priceBdt ?? 0),
    ...(fromSupplier ? { priceOnRequest: variants.every((variant) => variant.priceOnRequest) } : {}),
    currency: product.currency,
    available,
    instantDelivery: fromSupplier,
    ...(fromSupplier ? { locationOptions, proxyType: product.supplierCategory || "" } : {}),
    variants,
  };
}

function publicReview(review, userId = "") {
  const likes = Array.isArray(review.likes) ? review.likes : [];
  return {
    id: String(review._id),
    userName: review.userName || "Customer",
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    isOwn: Boolean(userId && String(review.userId) === String(userId)),
    likeCount: likes.length,
    userLiked: Boolean(userId && likes.includes(String(userId))),
    adminReply: review.adminReply?.text ? {
      text: review.adminReply.text,
      adminEmail: review.adminReply.adminEmail,
      repliedAt: review.adminReply.repliedAt,
    } : null,
  };
}

export async function listProducts(_req, res, next) {
  try {
    const products = await Product.find({ active: true }).sort({ createdAt: -1 }).lean();
    const slugs = [...new Set(products.filter((product) => product.source === "myproxyapi" && product.supplierCategory).map((product) => product.supplierCategory))];
    const locations = new Map(await Promise.all(slugs.map(async (slug) => [slug, await categoryLocations(slug).catch(() => [])])));
    res.json({ products: products.map((product) => publicProduct(product, locations.get(product.supplierCategory) || [])) });
  } catch (error) { next(error); }
}

export async function listProductReviews(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: "Product not found." });
    const reviews = (product.reviews || []).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ reviews: reviews.map((review) => publicReview(review, req.user?.id)) });
  } catch (error) { next(error); }
}

export async function addProductReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be between 1 and 5." });
    if (comment.length > 1000) return res.status(400).json({ error: "Feedback must be 1000 characters or fewer." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    if (product.reviews.some((review) => String(review.userId) === String(req.user.id))) return res.status(409).json({ error: "You have already reviewed this product." });
    product.reviews.push({
      userId: String(req.user.id),
      userName: req.user.name || req.user.email || "Verified customer",
      rating,
      comment,
    });
    const total = product.reviews.reduce((sum, review) => sum + review.rating, 0);
    product.rating = total / product.reviews.length;
    product.reviewCount = product.reviews.length;
    await product.save();
    res.status(201).json({ review: publicReview(product.reviews[product.reviews.length - 1], req.user.id), rating: product.rating, reviewCount: product.reviewCount });
  } catch (error) { next(error); }
}

export async function toggleProductReviewLike(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.reviewId)) return res.status(400).json({ error: "Invalid product or review id." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const review = product.reviews.id(req.params.reviewId);
    if (!review) return res.status(404).json({ error: "Comment not found." });
    if (!Array.isArray(review.likes)) review.likes = [];
    const userId = String(req.user.id);
    const index = review.likes.indexOf(userId);
    const userLiked = index === -1;
    if (userLiked) review.likes.push(userId);
    else review.likes.splice(index, 1);
    await product.save();
    res.json({ likeCount: review.likes.length, userLiked });
  } catch (error) { next(error); }
}

export async function adminReviews(_req, res, next) {
  try {
    const products = await Product.find({ "reviews.0": { $exists: true } }, { name: 1, reviews: 1 }).lean();
    const reviews = products.flatMap((product) => (product.reviews || []).map((review) => ({
      productId: String(product._id),
      productName: product.name,
      id: String(review._id),
      userName: review.userName || "Customer",
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      likeCount: review.likes?.length || 0,
      adminReply: review.adminReply?.text || "",
      adminEmail: review.adminReply?.adminEmail || "",
      repliedAt: review.adminReply?.repliedAt || null,
    })));
    reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ reviews });
  } catch (error) { next(error); }
}

export async function replyToProductReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.reviewId)) return res.status(400).json({ error: "Invalid product or review id." });
    const text = typeof req.body?.reply === "string" ? req.body.reply.trim() : "";
    if (text.length > 1500) return res.status(400).json({ error: "Reply must be 1500 characters or fewer." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const review = product.reviews.id(req.params.reviewId);
    if (!review) return res.status(404).json({ error: "Comment not found." });
    review.adminReply = text ? { text, adminEmail: String(req.user.email || "").toLowerCase(), repliedAt: new Date() } : { text: "", adminEmail: "", repliedAt: null };
    await product.save();
    res.json({ review: publicReview(review) });
  } catch (error) { next(error); }
}

export async function deleteProductReview(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.reviewId)) return res.status(400).json({ error: "Invalid product or review id." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    if (!product.reviews.id(req.params.reviewId)) return res.status(404).json({ error: "Comment not found." });
    product.reviews.pull(req.params.reviewId);
    product.reviewCount = product.reviews.length;
    product.rating = product.reviewCount ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviewCount : 0;
    await product.save();
    res.json({ deleted: true, reviewCount: product.reviewCount, rating: product.rating });
  } catch (error) { next(error); }
}

export async function createOrder(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.body?.productId)) return res.status(400).json({ error: "A valid product id is required." });
    const quantity = Number(req.body?.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ error: "Quantity must be a whole number between 1 and 100." });
    const currency = typeof req.body?.currency === "string" ? req.body.currency.toUpperCase() : "USD";
    if (!["USD", "BDT"].includes(currency)) return res.status(400).json({ error: "Currency must be USD or BDT." });
    const product = await Product.findOne({ _id: req.body.productId, active: true });
    if (!product) return res.status(404).json({ error: "Product not found." });
    const variant = req.body?.variantId ? product.variants.id(req.body.variantId) : null;
    if (req.body?.variantId && !variant) return res.status(404).json({ error: "Product variant not found." });
    if (product.source === "myproxyapi") return await createSupplierOrder(req, res, { product, variant, quantity, currency });
    const charge = await chargeWithCoupon(req, (currency === "BDT"
      ? (variant?.priceBdt ?? product.priceBdt)
      : (variant?.priceUsd ?? product.priceUsd ?? variant?.price ?? product.price)) * quantity, currency, product._id);
    const sharedVariantStock = Boolean(variant && variant.stockQuantity !== null && variant.stockQuantity !== undefined);
    if (sharedVariantStock && quantity > 1) return res.status(409).json({ error: `${variant.name} has only one shared code, so it can be bought one at a time. Ask the store to add separate codes for this plan.` });
    if (sharedVariantStock) {
      if (variant.stockQuantity < quantity) return res.status(409).json({ error: `Only ${variant.stockQuantity} unit(s) are currently available.` });
      const updated = await Product.findOneAndUpdate(
        { _id: product._id, variants: { $elemMatch: { _id: variant._id, stockQuantity: { $gte: quantity } } } },
        { $inc: { "variants.$[variant].stockQuantity": -quantity } },
        { arrayFilters: [{ "variant._id": variant._id, "variant.stockQuantity": { $gte: quantity } }], new: true }
      );
      if (!updated) return res.status(409).json({ error: "There is not enough stock for that quantity." });
    }
    const inventory = variant ? variant.codes : product.codes;
    const available = inventory.filter((item) => item.status === "available").length;
    if (!sharedVariantStock && available < quantity) return res.status(409).json({ error: `Only ${available} unit(s) are currently available.` });
    const order = new Order({
      userId: req.user.id,
      userName: req.user.name || "",
      userEmail: req.user.email || "",
      productId: product._id,
      productName: product.name,
      codeNumber: product.codeNumber,
      variantId: variant?._id || null,
      variantName: variant?.name || "",
      ...charge,
      currency,
      quantity,
    });
    order.invoiceId = getInvoiceId(order);
    let reserved = 0;
    const reservedVariantCodeIds = new Set();
    while (!sharedVariantStock && reserved < quantity) {
      const claimed = variant
        ? await (() => {
          const code = variant.codes.find((item) => item.status === "available" && !reservedVariantCodeIds.has(String(item._id)));
          if (!code) return null;
          return Product.updateOne({ _id: product._id }, { $set: { "variants.$[variant].codes.$[code].status": "reserved", "variants.$[variant].codes.$[code].orderId": order._id } }, { arrayFilters: [{ "variant._id": variant._id }, { "code._id": code._id, "code.status": "available" }] }).then((result) => {
            if (!result.modifiedCount) return null;
            reservedVariantCodeIds.add(String(code._id));
            return result;
          });
        })()
        : await Product.findOneAndUpdate({ _id: product._id, "codes.status": "available" }, { $set: { "codes.$.status": "reserved", "codes.$.orderId": order._id } }, { projection: { _id: 1 } });
      if (!claimed) break;
      reserved += 1;
    }
    if (!sharedVariantStock && reserved !== quantity) {
      if (variant) await Product.updateOne({ _id: product._id }, { $set: { "variants.$[variant].codes.$[code].status": "available", "variants.$[variant].codes.$[code].orderId": null } }, { arrayFilters: [{ "variant._id": variant._id }, { "code.orderId": order._id, "code.status": "reserved" }] });
      else await Product.updateOne({ _id: product._id }, { $set: { "codes.$[code].status": "available", "codes.$[code].orderId": null } }, { arrayFilters: [{ "code.orderId": order._id, "code.status": "reserved" }] });
      return res.status(409).json({ error: "There is not enough stock for that quantity." });
    }
    try { await order.save(); }
    catch (error) {
      if (sharedVariantStock) await Product.updateOne({ _id: product._id }, { $inc: { "variants.$[variant].stockQuantity": quantity } }, { arrayFilters: [{ "variant._id": variant._id }] });
      if (variant) await Product.updateOne({ _id: product._id }, { $set: { "variants.$[variant].codes.$[code].status": "available", "variants.$[variant].codes.$[code].orderId": null } }, { arrayFilters: [{ "variant._id": variant._id }, { "code.orderId": order._id, "code.status": "reserved" }] });
      else await Product.updateOne({ _id: product._id }, { $set: { "codes.$[code].status": "available", "codes.$[code].orderId": null } }, { arrayFilters: [{ "code.orderId": order._id, "code.status": "reserved" }] });
      throw error;
    }
    res.status(201).json({ order: { id: order.id, productName: order.productName, quantity: order.quantity, amount: order.amount, discount: order.discount, currency: order.currency, status: order.status }, message: "Order created. Your codes will appear in your purchase history after payment is confirmed." });
  } catch (error) {
    if (error instanceof CouponError) return res.status(400).json({ error: error.message });
    next(error);
  }
}

// The buyer's public IPv4 address, added to the proxy's authentication whitelist.
// Behind nginx the real address arrives in X-Real-IP (see deploy/nginx.conf).
function customerIpv4(req) {
  const candidates = [req.headers["x-real-ip"], String(req.headers["x-forwarded-for"] || "").split(",")[0], req.socket?.remoteAddress];
  for (const candidate of candidates) {
    const ip = String(candidate || "").trim().replace(/^::ffff:/, "");
    if (isIpv4(ip) && !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return ip;
  }
  return "";
}

const supplierUnavailable = "This plan is temporarily unavailable. Please try again later or contact support.";

async function createSupplierOrder(req, res, { product, variant, quantity, currency }) {
  if (!variant?.supplier?.planId) return res.status(400).json({ error: "Choose a plan first." });
  if (!((currency === "BDT" ? variant.priceBdt : variant.priceUsd) > 0)) return res.status(409).json({ error: "The price for this plan is not set yet. Please contact admin to order it." });
  if (quantity > SUPPLIER_MAX_QUANTITY) return res.status(400).json({ error: `You can buy up to ${SUPPLIER_MAX_QUANTITY} of this plan in one order.` });
  if (!supplierConfigured()) return res.status(503).json({ error: supplierUnavailable });
  let locations = variant.supplier.locations;
  let locationName = "";
  const ipsNeeded = (variant.supplier.ips || 1) * quantity;
  if (!locations) {
    const locationId = typeof req.body?.locationId === "string" ? req.body.locationId.trim() : "";
    if (!locationId) return res.status(400).json({ error: "Choose a location for your proxies." });
    let options;
    try { options = await categoryLocations(product.supplierCategory); }
    catch (error) { console.error("MyProxyApi locations failed:", error.message); return res.status(503).json({ error: supplierUnavailable }); }
    const location = options.find((item) => item.id === locationId);
    if (!location) return res.status(400).json({ error: "That location is no longer available. Refresh the page and choose another." });
    if (location.stock < ipsNeeded) return res.status(409).json({ error: `${location.name} has only ${location.stock} IP(s) left. Choose another location or a smaller plan.` });
    locations = location.id;
    locationName = location.name;
  }
  const charge = await chargeWithCoupon(req, (currency === "BDT" ? variant.priceBdt : (variant.priceUsd ?? variant.price)) * quantity, currency, product._id);
  const whitelistIp = isIpv4(req.body?.whitelistIp) ? req.body.whitelistIp.trim() : customerIpv4(req);
  if (!whitelistIp) return res.status(400).json({ error: "We could not detect your public IPv4 address, which the proxy needs. Turn off any VPN and try again, or contact support." });
  let costUsd;
  try {
    const price = await getPrice({ planId: variant.supplier.planId, period: variant.supplier.period });
    costUsd = price.priceUsd * quantity;
    await Product.updateOne({ _id: product._id }, { $set: { "variants.$[variant].supplier.costUsd": price.priceUsd, "variants.$[variant].supplier.costCheckedAt": new Date() } }, { arrayFilters: [{ "variant._id": variant._id }] });
    if (price.priceUsd > Number(variant.priceUsd ?? variant.price)) {
      console.error(`Supplier cost for ${product.name} / ${variant.name} is now $${price.priceUsd}, above the sell price. Update the price in the admin panel.`);
      return res.status(409).json({ error: supplierUnavailable });
    }
    // Funds already promised to other unpaid or undelivered supplier orders.
    const [reserved] = await Order.aggregate([{ $match: { source: "myproxyapi", status: { $in: ["pending", "processing"] } } }, { $group: { _id: null, total: { $sum: "$supplierCostUsd" } } }]);
    const balance = await availableBalanceUsd();
    if (balance < costUsd + (reserved?.total || 0)) {
      console.error(`MyProxyApi balance $${balance} is too low for a $${costUsd} order. Top up the reseller deposit.`);
      return res.status(409).json({ error: supplierUnavailable });
    }
  } catch (error) {
    if (!(error instanceof SupplierError)) throw error;
    console.error("MyProxyApi check before order failed:", error.message);
    return res.status(503).json({ error: supplierUnavailable });
  }
  const order = new Order({
    userId: req.user.id,
    userName: req.user.name || "",
    userEmail: req.user.email || "",
    productId: product._id,
    productName: product.name,
    codeNumber: product.codeNumber,
    variantId: variant._id,
    variantName: locationName ? `${variant.name} · ${locationName}` : variant.name,
    ...charge,
    currency,
    quantity,
    source: "myproxyapi",
    whitelistIp,
    supplierPlan: { planId: variant.supplier.planId, period: variant.supplier.period, locations, protocol: variant.supplier.protocol, planName: variant.supplier.planName },
    supplierCostUsd: costUsd,
  });
  order.invoiceId = getInvoiceId(order);
  await order.save();
  res.status(201).json({ order: { id: order.id, productName: order.productName, quantity: order.quantity, amount: order.amount, discount: order.discount, currency: order.currency, status: order.status }, message: "Order created. After payment your proxy is prepared automatically and arrives within 3–5 minutes." });
}

export async function listMyOrders(req, res, next) {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    // Products this customer has already rated, so the "rate your purchase" pop-up is not shown for them again.
    const productIds = [...new Set(orders.filter((order) => order.status === "paid").map((order) => String(order.productId)))];
    const reviewed = new Set(productIds.length ? (await Product.find({ _id: { $in: productIds }, "reviews.userId": String(req.user.id) }, { _id: 1 }).lean()).map((product) => String(product._id)) : []);
    res.json({ orders: orders.map((order) => ({ id: order._id, invoiceId: getInvoiceId(order), productId: order.productId, productName: order.productName, variantName: order.variantName || "", codeNumber: order.codeNumber, quantity: order.quantity || 1, amount: order.amount, discount: order.discount || 0, couponCode: order.couponCode || "", reviewed: reviewed.has(String(order.productId)), currency: order.currency, status: order.status, paymentMethod: order.paymentMethod || "", deliveredCode: order.status === "paid" ? order.deliveredCode : "", deliveredCodes: order.status === "paid" ? (order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : []) : [], isProxyOrder: order.source === "myproxyapi", deliveryPending: Boolean(order.supplierDeliveryPending), createdAt: order.createdAt, paidAt: order.paidAt })) });
  } catch (error) { next(error); }
}

export async function createStripeCheckout(req, res, next) {
  try {
    if (!config.stripeSecretKey) return res.status(503).json({ error: "Stripe is not configured on the server." });
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : (req.body?.orderId ? [req.body.orderId] : []);
    if (!orderIds.length || orderIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" });
    if (orders.length !== orderIds.length) return res.status(404).json({ error: "One or more pending orders were not found." });
    const currencies = new Set(orders.map((order) => String(order.currency).toLowerCase()));
    if (currencies.size !== 1) return res.status(400).json({ error: "Cart items must use the same payment currency." });
    const currency = [...currencies][0];
    if (!["usd", "bdt"].includes(currency)) return res.status(400).json({ error: "Stripe supports only USD or BDT for this product." });
    const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
    const stripe = new Stripe(config.stripeSecretKey);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${config.frontendOrigin}/profile?payment=success&orderIds=${encodeURIComponent(orderIds.join(","))}`,
      cancel_url: `${config.frontendOrigin}/checkout?payment=cancelled`,
      customer_email: req.user.email || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(totalAmount * 100),
          product_data: { name: orders.map((order) => order.variantName ? `${order.productName} — ${order.variantName}` : order.productName).join(", ") },
        },
      }],
      metadata: { orderIds: orderIds.join(",") },
    });
    res.json({ url: session.url });
  } catch (error) { next(error); }
}

export async function fulfillPaidOrder(orderId, { method, reference, paymentIntentId = "" }) {
  let order = await Order.findOneAndUpdate(
    { _id: orderId, status: "pending" },
    { $set: {
      status: "processing",
      paymentMethod: method,
      paymentReference: reference,
      ...(method === "stripe" ? { stripeCheckoutSessionId: reference, paymentIntentId } : {}),
    } },
    { new: true },
  );
  if (!order) {
    order = await Order.findOne({ _id: orderId, status: "processing", paymentMethod: method, paymentReference: reference });
    if (!order) {
      const existing = await Order.findOne({ _id: orderId, status: "paid" });
      if (existing) return;
      throw new Error(`Order ${orderId} is not available for ${method} fulfillment.`);
    }
  }
  if (order.source === "myproxyapi") return fulfillSupplierOrder(order._id);

  const product = await Product.findById(order.productId);
  const variant = order.variantId ? product?.variants.id(order.variantId) : null;
  if (!product || (order.variantId && !variant)) throw new Error(`Product inventory for order ${orderId} could not be found.`);
  let deliveredCodes = [];
  if (variant?.stockQuantity !== null && variant?.stockQuantity !== undefined) {
    if (!variant.secretCode) throw new Error(`The secret code for order ${orderId} is missing.`);
    deliveredCodes = [variant.secretCode];
  } else {
    const inventory = variant ? variant.codes : product.codes;
    deliveredCodes = inventory.filter((code) => String(code.orderId) === String(order._id) && ["reserved", "sold"].includes(code.status)).map((code) => code.value);
    if (deliveredCodes.length !== (order.quantity || 1)) throw new Error(`Reserved inventory for order ${orderId} is incomplete.`);
    if (variant) await Product.updateOne({ _id: product._id }, { $set: { "variants.$[variant].codes.$[code].status": "sold" } }, { arrayFilters: [{ "variant._id": variant._id }, { "code.orderId": order._id, "code.status": "reserved" }] });
    else await Product.updateOne({ _id: product._id }, { $set: { "codes.$[code].status": "sold" } }, { arrayFilters: [{ "code.orderId": order._id, "code.status": "reserved" }] });
  }

  await Order.updateOne({ _id: order._id, status: "processing", paymentMethod: method, paymentReference: reference }, {
    $set: { status: "paid", deliveredCode: deliveredCodes[0] || "", deliveredCodes, paidAt: new Date() },
  });
  notifyOrderPaid(order._id);
}

export async function stripeWebhook(req, res, next) {
  try {
    if (!config.stripeSecretKey || !config.stripeWebhookSecret) return res.status(503).json({ error: "Stripe webhook is not configured." });
    const signature = req.headers["stripe-signature"];
    if (!signature) return res.status(400).json({ error: "Missing Stripe signature." });
    const stripe = new Stripe(config.stripeSecretKey);
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret); }
    catch { return res.status(400).json({ error: "Invalid Stripe webhook signature." }); }

    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        const orderIds = (session.metadata?.orderIds || "").split(",").filter((id) => mongoose.isValidObjectId(id));
        if (!orderIds.length) return res.status(400).json({ error: "Stripe session has no valid order ids." });
        for (const orderId of orderIds) await fulfillPaidOrder(orderId, { method: "stripe", reference: session.id, paymentIntentId: String(session.payment_intent || "") });
      }
    }
    res.json({ received: true });
  } catch (error) { next(error); }
}

export function paymentMode(_req, res) {
  // Hosted gateways the customer can choose between at checkout.
  const methods = [config.zinipayApiKey && "zinipay", config.cryptomusEnabled && "cryptomus"].filter(Boolean);
  const mode = methods[0] || (config.stripeSecretKey ? "stripe" : config.demoPaymentEnabled ? "demo" : "disabled");
  // The wallet is offered next to the hosted gateways once accounts are enabled; it is topped up through them.
  const allMethods = methods.length ? methods : [mode];
  if (config.authEnabled && methods.length) allMethods.push("wallet");
  res.json({ mode, methods: allMethods, serviceFeePercent: config.serviceFeePercent, bdtPerUsd: config.wallet.bdtPerUsd });
}

export async function completeDemoPayment(req, res, next) {
  try {
    if (!config.demoPaymentEnabled) return res.status(404).json({ error: "Demo payments are disabled." });
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : (req.body?.orderId ? [req.body.orderId] : []);
    if (!orderIds.length || orderIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ error: "Valid order ids are required." });
    const orders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id, status: "pending" });
    if (orders.length !== orderIds.length) return res.status(404).json({ error: "One or more pending orders were not found." });
    for (const order of orders) await fulfillPaidOrder(String(order._id), { method: "demo", reference: `demo_${order._id}` });
    const paidOrders = await Order.find({ _id: { $in: orderIds }, userId: req.user.id, status: "paid" }).lean();
    res.json({ paid: true, orderIds, orders: paidOrders.map((order) => ({ id: String(order._id), invoiceId: getInvoiceId(order), productName: order.productName, variantName: order.variantName, quantity: order.quantity || 1, amount: order.amount, currency: order.currency, paymentMethod: order.paymentMethod, userName: order.userName, userEmail: order.userEmail, createdAt: order.createdAt, paidAt: order.paidAt, deliveredCodes: order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : [] })), message: "Demo payment successful. No real payment was charged." });
  } catch (error) { next(error); }
}

function productInput(body, partial = false) {
  const result = {};
  for (const key of ["name", "description", "codeNumber", "imageUrl", "category", "brand"]) {
    if (Object.hasOwn(body, key)) {
      if (typeof body[key] !== "string") throw new Error(`${key} must be text.`);
      result[key] = body[key].trim();
      if (key === "imageUrl" && result[key]) {
        let url;
        try { url = new URL(result[key]); } catch { throw new Error("Image URL must be a valid HTTPS or HTTP URL."); }
        if (!["https:", "http:"].includes(url.protocol)) throw new Error("Image URL must use HTTP or HTTPS.");
      }
    }
  }
  if (Object.hasOwn(body, "price")) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) throw new Error("Price must be a valid non-negative number.");
    result.price = price;
  }
  if (Object.hasOwn(body, "currency")) {
    if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency)) throw new Error("Currency must be a three-letter code.");
    result.currency = body.currency.toUpperCase();
  }
  for (const [key, label] of [["priceUsd", "USD price"], ["priceBdt", "BDT price"]]) {
    if (Object.hasOwn(body, key)) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a valid non-negative number.`);
      result[key] = value;
    }
  }
  for (const [key, min, max] of [["discountPercent", 0, 99], ["rating", 0, 5], ["reviewCount", 0, 1000000]]) {
    if (Object.hasOwn(body, key)) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < min || value > max || (key === "reviewCount" && !Number.isInteger(value))) throw new Error(`${key} must be between ${min} and ${max}${key === "reviewCount" ? " as a whole number" : ""}.`);
      result[key] = value;
    }
  }
  if (Object.hasOwn(body, "showInPopular")) {
    if (typeof body.showInPopular !== "boolean") throw new Error("showInPopular must be true or false.");
    result.showInPopular = body.showInPopular;
  }
  if (Object.hasOwn(body, "popularOrder")) {
    const order = Number(body.popularOrder);
    if (!Number.isInteger(order) || order < 0 || order > 10000) throw new Error("Popular display order must be a whole number between 0 and 10,000.");
    result.popularOrder = order;
  }
  if (Object.hasOwn(body, "active")) result.active = Boolean(body.active);
  if (!partial && (!result.name || !result.codeNumber || result.price === undefined)) throw new Error("Name, product code number, and price are required.");
  return result;
}

export async function adminProducts(_req, res, next) {
  try {
    const products = await Product.find().sort({ createdAt: -1 }).lean();
    res.json({ products: products.map((product) => {
      const codes = [...(product.codes || []), ...(product.variants || []).flatMap((variant) => variant.codes || [])];
      const variantAvailable = (product.variants || []).reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
      return { ...product, id: product._id, stockAvailable: codes.filter((code) => code.status === "available").length + variantAvailable, stockReserved: codes.filter((code) => code.status === "reserved").length, stockSold: codes.filter((code) => code.status === "sold").length };
    }) });
  } catch (error) { next(error); }
}

export async function addProduct(req, res, next) {
  try {
    const fields = productInput(req.body);
    const variants = Array.isArray(req.body.variants) ? req.body.variants : [];
    if (req.body.source === "myproxyapi") {
      const supplierCategory = Object.hasOwn(SUPPLIER_CATEGORIES, req.body.supplierCategory) ? req.body.supplierCategory : "";
      const supplierVariants = await supplierVariantsInput(variants, [], supplierCategory);
      const product = await Product.create({ ...fields, source: "myproxyapi", supplierCategory, codes: [], variants: supplierVariants });
      await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "added", adminEmail: String(req.user.email || "").toLowerCase(), details: `API product created with ${supplierVariants.length} plan(s)` });
      return res.status(201).json({ product: { ...product.toObject(), id: product.id, stockAvailable: 0, stockSold: 0, stockReserved: 0 } });
    }
    if (!variants.length) throw new Error("Add at least one product variant and set its price there.");
    const normalizedVariants = [];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const label = `Variant ${index + 1}`;
      const name = typeof variant.name === "string" ? variant.name.trim() : "";
      if (!name) throw new Error(`${label}: Name is missing. Set Capacity and Unit.`);
      const price = Number(variant.price);
      if (!Number.isFinite(price) || price < 0) throw new Error(`${label} (${name}): Price is required and must be a valid number.`);
      const priceUsd = Number(variant.priceUsd);
      const priceBdt = Number(variant.priceBdt);
      if (!Number.isFinite(priceUsd) || priceUsd < 0) throw new Error(`${label} (${name}): USD price is required.`);
      if (!Number.isFinite(priceBdt) || priceBdt < 0) throw new Error(`${label} (${name}): BDT price is required.`);
      const codes = parseCodeList(variant.codes);
      if (!codes.length) throw new Error(`${label} (${name}): Add at least one code (one code per line).`);
      if (codes.length > 10000) throw new Error(`${label} (${name}): A variant can hold at most 10000 codes.`);
      normalizedVariants.push({ name, price, priceUsd, priceBdt, stockQuantity: null, secretCode: "", codes: codes.map((value) => ({ value })) });
    }
    const duplicate = findDuplicateCode(normalizedVariants.flatMap((variant) => variant.codes.map((code) => code.value)));
    if (duplicate) throw new Error(`The code "${duplicate}" is entered more than once. Each code must be unique.`);
    const usedCode = await findUsedCode(normalizedVariants.flatMap((variant) => variant.codes.map((code) => code.value)));
    if (usedCode) throw new Error(usedCodeMessage(usedCode));
    const product = await Product.create({ ...fields, codes: [], variants: normalizedVariants });
    await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "added", adminEmail: String(req.user.email || "").toLowerCase(), details: "Product created" });
    const stockAvailable = product.variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? variant.codes.length), 0);
    res.status(201).json({ product: { ...product.toObject(), id: product.id, stockAvailable, stockSold: 0, stockReserved: 0 } });
  } catch (error) { if (error.name === "Error") return res.status(400).json({ error: error.message }); next(error); }
}

export async function editProduct(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const fields = productInput(req.body, true);
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    Object.assign(product, fields);
    if (product.source === "myproxyapi" && Object.hasOwn(req.body, "variants")) {
      const supplierVariants = await supplierVariantsInput(req.body.variants, product.variants, product.supplierCategory);
      const keptIds = new Set(supplierVariants.map((variant) => String(variant._id || "")).filter(Boolean));
      for (const existing of product.variants) {
        if (!keptIds.has(String(existing._id)) && await Order.exists({ variantId: existing._id, status: { $in: ["pending", "processing"] } })) return res.status(409).json({ error: `${existing.name} has unpaid or undelivered orders. Finish or cancel them before removing this plan.` });
      }
      product.variants = supplierVariants;
    } else if (Object.hasOwn(req.body, "variants")) {
      if (!Array.isArray(req.body.variants)) return res.status(400).json({ error: "Variants must be an array." });
      if (!req.body.variants.length) return res.status(400).json({ error: "A product needs at least one variant with its own price." });
      const keptIds = new Set(req.body.variants.map((input) => input.id).filter(Boolean));
      for (const existing of [...product.variants]) {
        if (!keptIds.has(String(existing._id))) {
          const blocked = await unpaidOrderBlock({ variantId: existing._id }, existing.name);
          if (blocked) return res.status(409).json({ error: blocked });
          product.variants.pull(existing._id);
        }
      }
      const allExistingCodes = new Set([
        ...product.codes.map((code) => code.value),
        ...product.variants.flatMap((item) => item.codes.map((code) => code.value)),
        ...product.variants.map((item) => item.secretCode).filter(Boolean),
      ]);
      const normalized = [];
      for (let index = 0; index < req.body.variants.length; index += 1) {
        const input = req.body.variants[index];
        const label = `Variant ${index + 1}`;
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const price = Number(input.price);
        const priceUsd = Number(input.priceUsd);
        const priceBdt = Number(input.priceBdt);
        if (!name) return res.status(400).json({ error: `${label}: Name is missing. Set Capacity and Unit.` });
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: `${label} (${name}): Price is required and must be a valid number.` });
        if (!Number.isFinite(priceUsd) || priceUsd < 0) return res.status(400).json({ error: `${label} (${name}): USD price is required.` });
        if (!Number.isFinite(priceBdt) || priceBdt < 0) return res.status(400).json({ error: `${label} (${name}): BDT price is required.` });
        if (input.id) {
          const variant = product.variants.id(input.id);
          if (!variant) return res.status(400).json({ error: "One of the existing variants is invalid." });
          variant.name = name;
          variant.price = price;
          variant.priceUsd = priceUsd;
          variant.priceBdt = priceBdt;
          const newCodes = parseCodeList(input.newCodes);
          if (newCodes.length) {
            const duplicate = findDuplicateCode(newCodes) || newCodes.find((code) => allExistingCodes.has(code));
            if (duplicate) return res.status(409).json({ error: `${label} (${name}): The code "${duplicate}" already exists. Each code must be unique.` });
            const usedCode = await findUsedCode(newCodes);
            if (usedCode) return res.status(409).json({ error: `${label} (${name}): ${usedCodeMessage(usedCode)}` });
            if (variant.codes.length + newCodes.length > 10000) return res.status(400).json({ error: `${label} (${name}): A variant can hold at most 10000 codes.` });
            const usesOldQuantityStock = variant.stockQuantity !== null && variant.stockQuantity !== undefined;
            if (usesOldQuantityStock) {
              const openOrder = await Order.exists({ variantId: variant._id, status: { $in: ["pending", "processing"] } });
              if (openOrder) return res.status(409).json({ error: `${label} (${name}): This plan still has unpaid orders from the old quantity stock. Confirm or cancel them before adding codes.` });
              variant.stockQuantity = null;
              variant.secretCode = "";
            }
            variant.codes.push(...newCodes.map((value) => ({ value })));
            newCodes.forEach((code) => allExistingCodes.add(code));
          }
          normalized.push(variant);
        } else {
          const codes = parseCodeList(input.codes);
          if (!codes.length) return res.status(400).json({ error: `${label} (${name}): Add at least one code (one code per line).` });
          if (codes.length > 10000) return res.status(400).json({ error: `${label} (${name}): A variant can hold at most 10000 codes.` });
          const duplicate = findDuplicateCode(codes) || codes.find((code) => allExistingCodes.has(code));
          if (duplicate) return res.status(409).json({ error: `${label} (${name}): The code "${duplicate}" already exists. Each code must be unique.` });
          const usedCode = await findUsedCode(codes);
          if (usedCode) return res.status(409).json({ error: `${label} (${name}): ${usedCodeMessage(usedCode)}` });
          codes.forEach((code) => allExistingCodes.add(code));
          normalized.push({ name, price, priceUsd, priceBdt, stockQuantity: null, secretCode: "", codes: codes.map((value) => ({ value })) });
        }
      }
      if (normalized.length) product.variants = normalized;
    }
    await product.save();
    await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "edited", adminEmail: String(req.user.email || "").toLowerCase(), details: "Product information updated" });
    res.json({ product });
  } catch (error) { if (error.name === "Error") return res.status(400).json({ error: error.message }); next(error); }
}

// While a customer still has time to pay for an unpaid order, the product or plan it holds stock from cannot be removed.
// Orders whose time is up are cancelled first (as the background job would), which returns their stock.
async function unpaidOrderBlock(filter, label) {
  await expirePendingOrders();
  const orders = await Order.find({ ...filter, status: { $in: ["pending", "processing"] } });
  if (!orders.length) return "";
  if (orders.some((order) => order.status === "processing")) return `${label} has orders being paid or delivered right now. Wait for them to finish, then try again.`;
  const releaseAt = Math.max(...orders.map((order) => Math.max(
    new Date(order.createdAt).getTime() + PENDING_ORDER_EXPIRY_MS,
    order.paymentStartedAt ? new Date(order.paymentStartedAt).getTime() + PENDING_ORDER_EXPIRY_MS : 0,
    order.paymentHoldUntil ? new Date(order.paymentHoldUntil).getTime() : 0,
  )));
  const minutes = Math.max(1, Math.ceil((releaseAt - Date.now()) / 60000));
  return `${label} has ${orders.length} unpaid order(s) whose customer can still pay. If they do not pay, the stock comes back automatically in about ${minutes} minute(s); you can delete it then.`;
}

export async function deleteProduct(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const hasSoldCodes = [...(product.codes || []), ...(product.variants || []).flatMap((variant) => variant.codes || [])].some((code) => code.status === "sold");
    if (hasSoldCodes) return res.status(409).json({ error: "Cannot delete a product that has sold codes." });
    const blocked = await unpaidOrderBlock({ productId: product._id }, "This product");
    if (blocked) return res.status(409).json({ error: blocked });
    await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "deleted", adminEmail: String(req.user.email || "").toLowerCase(), details: "Product deleted" });
    await Product.deleteOne({ _id: product._id });
    res.json({ deleted: true });
  } catch (error) { next(error); }
}

export async function addCodes(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const codes = Array.isArray(req.body.codes) ? req.body.codes : [];
    const cleaned = [...new Set(codes.filter((code) => typeof code === "string").map((code) => code.trim()).filter(Boolean))];
    if (!cleaned.length || cleaned.length > 500) return res.status(400).json({ error: "Add between 1 and 500 product codes." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const existing = new Set(product.codes.map((item) => item.value));
    const uniqueNewCodes = cleaned.filter((code) => !existing.has(code));
    if (!uniqueNewCodes.length) return res.status(409).json({ error: "Those codes are already in this product's inventory." });
    const usedCode = await findUsedCode(uniqueNewCodes);
    if (usedCode) return res.status(409).json({ error: usedCodeMessage(usedCode) });
    product.codes.push(...uniqueNewCodes.map((value) => ({ value })));
    await product.save();
    await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "codes_added", adminEmail: String(req.user.email || "").toLowerCase(), details: `${uniqueNewCodes.length} inventory code(s) added` });
    res.json({ stockAvailable: product.codes.filter((item) => item.status === "available").length });
  } catch (error) { next(error); }
}

export async function setProductStock(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid product id." });
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10000) return res.status(400).json({ error: "Quantity must be a whole number between 0 and 10,000." });
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found." });
    const variantId = typeof req.body.variantId === "string" ? req.body.variantId : "";
    const variant = variantId ? product.variants.id(variantId) : null;
    if (variantId && !variant) return res.status(404).json({ error: "Product variant not found." });
    if (variant && variant.stockQuantity !== null && variant.stockQuantity !== undefined) {
      const previous = variant.stockQuantity;
      variant.stockQuantity = quantity;
      await product.save();
      await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "stock_renewed", adminEmail: String(req.user.email || "").toLowerCase(), details: `${variant.name}: ${previous} → ${quantity} available` });
      return res.json({
        stockAvailable: variant.stockQuantity,
        stockReserved: 0,
        stockSold: 0,
      });
    }
    const inventory = variant ? variant.codes : product.codes;
    const current = inventory.filter((code) => code.status === "available").length;
    const difference = quantity - current;
    if (difference > 0) {
      const codes = Array.isArray(req.body.codes) ? req.body.codes.filter((code) => typeof code === "string").map((code) => code.trim()).filter(Boolean) : [];
      const existing = new Set([
        ...product.codes.map((code) => code.value),
        ...product.variants.flatMap((item) => item.codes.map((code) => code.value)),
      ]);
      if (codes.length !== difference || new Set(codes).size !== codes.length || codes.some((code) => existing.has(code))) return res.status(400).json({ error: `Add exactly ${difference} new unique code(s) to increase stock to ${quantity}.` });
      const usedCode = await findUsedCode(codes);
      if (usedCode) return res.status(409).json({ error: usedCodeMessage(usedCode) });
      inventory.push(...codes.map((value) => ({ value })));
    } else if (difference < 0) {
      let remove = -difference;
      for (const code of [...inventory].reverse()) {
        if (remove === 0) break;
        if (code.status === "available") { inventory.pull(code._id); remove -= 1; }
      }
      if (remove) return res.status(409).json({ error: "Stock changed while updating. Refresh and try again." });
    }
    await product.save();
    await ProductActivity.create({ productId: String(product._id), productName: product.name, action: "stock_renewed", adminEmail: String(req.user.email || "").toLowerCase(), details: `${variant?.name || "Main product"}: ${current} → ${quantity} available` });
    res.json({
      stockAvailable: inventory.filter((code) => code.status === "available").length,
      stockReserved: inventory.filter((code) => code.status === "reserved").length,
      stockSold: inventory.filter((code) => code.status === "sold").length,
    });
  } catch (error) { next(error); }
}

export async function adminOrders(_req, res, next) {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    res.json({ orders: orders.map((order) => ({ ...order, invoiceId: getInvoiceId(order) })) });
  }
  catch (error) { next(error); }
}

export async function confirmOrderPayment(req, res, next) {
  let claimedCodes = [];
  let productId;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const supplierOrder = await Order.findOne({ _id: req.params.id, source: "myproxyapi" }, { status: 1 }).lean();
    if (supplierOrder) {
      if (supplierOrder.status !== "pending") return res.status(409).json({ error: "Order is not pending payment." });
      await fulfillPaidOrder(req.params.id, { method: "", reference: `admin_${String(req.user.email || "").toLowerCase()}` });
      return res.json({ order: await Order.findById(req.params.id).lean() });
    }
    const order = await Order.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { $set: { status: "processing" } }, { new: true });
    if (!order) return res.status(409).json({ error: "Order is not pending payment." });
    productId = order.productId;
    const product = await Product.findById(order.productId);
    const inventory = order.variantId ? product?.variants.id(order.variantId)?.codes : product?.codes;
    const orderedVariant = order.variantId ? product?.variants.id(order.variantId) : null;
    if (orderedVariant && orderedVariant.stockQuantity !== null && orderedVariant.stockQuantity !== undefined) {
      claimedCodes = orderedVariant.secretCode ? [orderedVariant.secretCode] : [];
    } else {
      claimedCodes = inventory?.filter((item) => String(item.orderId) === String(order._id) && item.status === "reserved").map((item) => item.value) || [];
    }
    if ((orderedVariant && orderedVariant.stockQuantity !== null && orderedVariant.stockQuantity !== undefined)
      ? claimedCodes.length !== 1
      : claimedCodes.length !== (order.quantity || 1)) {
      claimedCodes = [];
      await Order.updateOne({ _id: order._id, status: "processing" }, { $set: { status: "pending" } });
      return res.status(409).json({ error: "The full reserved quantity was not found. Review this order before confirming payment." });
    }
    if (order.variantId) await Product.updateOne({ _id: order.productId }, { $set: { "variants.$[variant].codes.$[code].status": "sold" } }, { arrayFilters: [{ "variant._id": order.variantId }, { "code.orderId": order._id, "code.status": "reserved" }] });
    else await Product.updateOne({ _id: order.productId }, { $set: { "codes.$[code].status": "sold" } }, { arrayFilters: [{ "code.orderId": order._id, "code.status": "reserved" }] });
    const updated = await Order.findOneAndUpdate({ _id: order._id, status: "processing" }, { $set: { status: "paid", deliveredCode: claimedCodes[0], deliveredCodes: claimedCodes, paidAt: new Date() } }, { new: true });
    if (!updated) throw new Error("Order could not be completed.");
    notifyOrderPaid(updated._id);
    res.json({ order: updated });
  } catch (error) {
    if (claimedCodes.length && productId) {
      const failedOrder = await Order.findById(req.params.id).catch(() => null);
      if (failedOrder?.variantId) await Product.updateOne({ _id: productId }, { $set: { "variants.$[variant].codes.$[code].status": "reserved" } }, { arrayFilters: [{ "variant._id": failedOrder.variantId }, { "code.orderId": req.params.id, "code.status": "sold" }] }).catch(() => {});
      else await Product.updateOne({ _id: productId }, { $set: { "codes.$[code].status": "reserved" } }, { arrayFilters: [{ "code.orderId": req.params.id, "code.status": "sold" }] }).catch(() => {});
    }
    await Order.updateOne({ _id: req.params.id, status: "processing" }, { $set: { status: "pending" } }).catch(() => {});
    next(error);
  }
}

// Puts an unpaid order's reserved stock back: shared-stock plans get their count back, code plans get their
// reserved codes marked available again.
export async function releaseReservedStock(order) {
  if (order.variantId) {
    const product = await Product.findById(order.productId);
    const variant = product?.variants.id(order.variantId);
    if (variant && variant.stockQuantity !== null && variant.stockQuantity !== undefined) {
      await Product.updateOne({ _id: order.productId }, { $inc: { "variants.$[variant].stockQuantity": order.quantity || 1 } }, { arrayFilters: [{ "variant._id": order.variantId }] });
    } else {
      await Product.updateOne({ _id: order.productId }, { $set: { "variants.$[variant].codes.$[code].status": "available", "variants.$[variant].codes.$[code].orderId": null } }, { arrayFilters: [{ "variant._id": order.variantId }, { "code.orderId": order._id, "code.status": "reserved" }] });
    }
  } else {
    await Product.updateOne({ _id: order.productId }, { $set: { "codes.$[code].status": "available", "codes.$[code].orderId": null } }, { arrayFilters: [{ "code.orderId": order._id, "code.status": "reserved" }] });
  }
}

// Admin: permanently removes an order (for example a demo or test order). Income and order counts are
// calculated from orders, so its amount no longer counts. A pending order's reserved stock goes back.
// Codes of a paid order stay "sold" (they were already delivered), and no money is refunded.
// Orders being paid or delivered right now cannot be deleted.
export async function deleteOrder(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const order = await Order.findOneAndDelete({ _id: req.params.id, status: { $ne: "processing" } });
    if (!order) {
      const exists = await Order.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ error: exists ? "This order is being paid or delivered right now. Wait for it to finish, then delete it." : "Order not found." });
    }
    if (order.status === "pending") await releaseReservedStock(order);
    await ProductActivity.create({ productId: String(order.productId), productName: order.productName, action: "order_deleted", adminEmail: String(req.user.email || "").toLowerCase(), details: `Order #${String(order._id).slice(-7)} (${order.status}, ${order.currency} ${Number(order.amount).toFixed(2)}, ${order.userEmail || order.userId}) deleted permanently${order.status === "pending" ? "; reserved stock returned" : ""}` });
    res.json({ deleted: true, status: order.status, amount: order.amount, currency: order.currency });
  } catch (error) { next(error); }
}

export async function cancelOrder(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const order = await Order.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { $set: { status: "cancelled" } }, { new: true });
    if (!order) return res.status(409).json({ error: "Only pending orders can be cancelled." });
    await releaseReservedStock(order);
    await ProductActivity.create({ productId: String(order.productId), productName: order.productName, action: "order_cancelled", adminEmail: String(req.user.email || "").toLowerCase(), details: `Order #${String(order._id).slice(-7)} cancelled; ${order.variantName ? `${order.variantName}, ` : ""}${order.quantity || 1} unit(s) returned to stock` });
    res.json({ order });
  } catch (error) { next(error); }
}

export const PENDING_ORDER_EXPIRY_MS = 30 * 60 * 1000;

export async function expirePendingOrders() {
  const cutoff = new Date(Date.now() - PENDING_ORDER_EXPIRY_MS);
  // An order whose customer was just sent to a payment page gets another 30 minutes to finish paying.
  const expiredOrders = await Order.find({ status: "pending", createdAt: { $lt: cutoff }, $and: [
    { $or: [{ paymentStartedAt: null }, { paymentStartedAt: { $lt: cutoff } }] },
    { $or: [{ paymentHoldUntil: null }, { paymentHoldUntil: { $lt: new Date() } }] },
  ] });
  let cancelledCount = 0;
  for (const order of expiredOrders) {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "pending" },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!updated) continue;
    await releaseReservedStock(order);
    await ProductActivity.create({ productId: String(order.productId), productName: order.productName, action: "order_cancelled", adminEmail: "system", details: `Order #${String(order._id).slice(-7)} expired; ${order.variantName ? `${order.variantName}, ` : ""}${order.quantity || 1} unit(s) returned to stock` });
    cancelledCount += 1;
  }
  return cancelledCount;
}

export async function adminUsers(_req, res, next) {
  try {
    const users = await mongoose.connection.collection("user").find({}, { projection: { name: 1, email: 1, image: 1, phone: 1, createdAt: 1, emailVerified: 1, banned: 1, banReason: 1, bannedAt: 1 } }).sort({ createdAt: -1 }).toArray();
    const orders = await Order.find().sort({ createdAt: -1 }).lean();
    const adminSet = new Set([...config.adminEmails, ...(await AdminEmail.find({}, { email: 1 }).lean()).map((item) => item.email)]);
    const byUser = new Map();
    for (const order of orders) {
      const id = String(order.userId);
      const record = byUser.get(id) || { purchases: [], paidTotals: {} };
      record.purchases.push({ id: String(order._id), invoiceId: getInvoiceId(order), productName: order.productName, variantName: order.variantName || "", quantity: order.quantity || 1, amount: order.amount, currency: order.currency, status: order.status, createdAt: order.createdAt, paidAt: order.paidAt || null });
      if (order.status === "paid") record.paidTotals[order.currency] = (record.paidTotals[order.currency] || 0) + order.amount;
      byUser.set(id, record);
    }
    res.json({ users: users.map((user) => {
      const record = byUser.get(String(user._id)) || { purchases: [], paidTotals: {} };
      return { id: user._id, name: user.name, email: user.email, image: user.image, phone: user.phone || "", emailVerified: Boolean(user.emailVerified), createdAt: user.createdAt, banned: Boolean(user.banned), banReason: user.banReason || "", bannedAt: user.bannedAt || null, isAdmin: adminSet.has(String(user.email || "").toLowerCase()), orderCount: record.purchases.length, paidTotals: record.paidTotals, purchases: record.purchases };
    }) });
  } catch (error) { next(error); }
}

export async function productActivity(_req, res, next) {
  try {
    const activity = await ProductActivity.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ activity });
  } catch (error) { next(error); }
}

export async function listAdminEmails(_req, res, next) {
  try {
    const databaseAdmins = await AdminEmail.find().sort({ email: 1 }).lean();
    const byEmail = new Map(databaseAdmins.map((item) => [item.email, { id: String(item._id), email: item.email, source: "Admin panel", addedAt: item.createdAt }]));
    for (const email of config.adminEmails) {
      if (!byEmail.has(email)) byEmail.set(email, { id: "", email, source: "Environment", addedAt: null });
    }
    res.json({ admins: [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email)) });
  } catch (error) { next(error); }
}

export async function addAdminEmail(req, res, next) {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
    if (config.adminEmails.includes(email)) return res.status(409).json({ error: "This email is already allowed by the environment settings." });
    const result = await AdminEmail.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, addedBy: String(req.user.email || "").toLowerCase() } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.status(201).json({ admin: { id: String(result._id), email: result.email, source: "Admin panel", addedAt: result.createdAt } });
  } catch (error) { next(error); }
}

export async function removeAdminEmail(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid admin entry." });
    const admin = await AdminEmail.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Admin email not found." });
    if (!config.adminEmails.length && await AdminEmail.countDocuments({ _id: { $ne: admin._id } }) === 0) return res.status(409).json({ error: "Keep at least one admin email so the panel remains accessible." });
    await AdminEmail.deleteOne({ _id: admin._id });
    res.json({ removed: admin.email });
  } catch (error) { next(error); }
}

export async function adminOverview(_req, res, next) {
  try {
    const [products, users, orders, paid, recentOrders, monthly] = await Promise.all([
      Product.countDocuments(), mongoose.connection.collection("user").countDocuments(), Order.countDocuments(),
      Order.aggregate([{ $match: { status: "paid" } }, { $group: { _id: null, revenue: { $sum: "$amount" } } }]),
      Order.find().sort({ createdAt: -1 }).limit(8).lean(),
      Order.aggregate([{ $match: { status: "paid", paidAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } }, revenue: { $sum: "$amount" }, orders: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    ]);
    const monthlyMap = new Map(monthly.map((item) => [item._id, item]));
    const chart = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - 5 + index);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { month: date.toLocaleString("en", { month: "short" }), revenue: monthlyMap.get(key)?.revenue || 0, orders: monthlyMap.get(key)?.orders || 0 };
    });
    res.json({ stats: { products, users, orders, revenue: paid[0]?.revenue || 0, bdtPerUsd: config.wallet.bdtPerUsd }, chart, recentOrders: recentOrders.map((order) => ({ ...order, invoiceId: getInvoiceId(order) })) });
  } catch (error) { next(error); }
}
