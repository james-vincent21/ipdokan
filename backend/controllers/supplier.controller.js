import mongoose from "mongoose";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { ProductActivity } from "../models/product-activity.model.js";
import {
  SUPPLIER_CATEGORIES, SUPPLIER_PERIODS, SUPPLIER_PROTOCOLS, SupplierError,
  accountInfo, extractProxies, getPrice, listCategories, listPlans, orderDetails, parseCategory, parseLocationTree, placeOrder, supplierConfigured,
} from "../lib/myproxyapi.js";

// Each unit of quantity is one supplier order (a plan already holds its own number of IPs).
export const SUPPLIER_MAX_QUANTITY = 10;
const LOCK_MS = 3 * 60 * 1000;
const DELIVERY_RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_DETAILS_BYTES = 32 * 1024;

const pendingLine = (supplierOrder) => `Order ${supplierOrder.orderId}${supplierOrder.planName ? ` (${supplierOrder.planName})` : ""}: your proxies are being prepared and will appear here shortly.`;

function compactDetails(details) {
  try {
    const json = JSON.stringify(details ?? null);
    return json.length > MAX_DETAILS_BYTES ? { truncated: true, preview: json.slice(0, MAX_DETAILS_BYTES) } : details;
  } catch { return null; }
}

// Validates the variants of a supplier product and checks each plan's current cost with the supplier.
// A plan with no location set lets the buyer choose one of the category's cities at checkout.
export async function supplierVariantsInput(variants, existingVariants = [], supplierCategory = "") {
  if (!supplierConfigured()) throw new Error("MyProxyApi is not configured on the server. Add MYPROXYAPI_USERNAME and MYPROXYAPI_SECRET to .env and restart the API.");
  if (!Array.isArray(variants) || !variants.length) throw new Error("Add at least one plan.");
  const result = [];
  for (let index = 0; index < variants.length; index += 1) {
    const input = variants[index] || {};
    const label = `Plan ${index + 1}`;
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 80) throw new Error(`${label}: Give the plan a display name (up to 80 characters), for example "USA · 1 Month".`);
    const priceUsd = Number(input.priceUsd);
    const priceBdt = Number(input.priceBdt);
    // 0 means "price not set": the plan is shown but customers are asked to contact the admin.
    if (!Number.isFinite(priceUsd) || priceUsd < 0) throw new Error(`${label} (${name}): USD price must be 0 (not set) or more.`);
    if (!Number.isFinite(priceBdt) || priceBdt < 0) throw new Error(`${label} (${name}): BDT price must be 0 (not set) or more.`);
    const supplier = input.supplier || {};
    const planId = Number(supplier.planId);
    if (!Number.isInteger(planId) || planId <= 0) throw new Error(`${label} (${name}): Choose a supplier plan id.`);
    const period = String(supplier.period || "").trim();
    if (!SUPPLIER_PERIODS.includes(period)) throw new Error(`${label} (${name}): Period must be one of ${SUPPLIER_PERIODS.join(", ")}.`);
    const locations = String(supplier.locations || "").trim();
    if (!locations && !Object.hasOwn(SUPPLIER_CATEGORIES, supplierCategory)) throw new Error(`${label} (${name}): Enter the supplier location id, or set the supplier category so customers can choose the location.`);
    if (locations && (!/^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*$/.test(locations) || locations.length > 200)) throw new Error(`${label} (${name}): Enter the supplier location id (several ids separated by commas).`);
    const protocol = SUPPLIER_PROTOCOLS.includes(supplier.protocol) ? supplier.protocol : "http";
    let price;
    try { price = await getPrice({ planId, period }); }
    catch (error) { throw new Error(`${label} (${name}): The supplier rejected this plan: ${error.message}`); }
    if (priceUsd > 0 && priceUsd < price.priceUsd) throw new Error(`${label} (${name}): The USD price ($${priceUsd.toFixed(2)}) is below the supplier cost ($${price.priceUsd.toFixed(2)}).`);
    const existing = input.id ? existingVariants.find((variant) => String(variant._id) === String(input.id)) : null;
    if (input.id && !existing) throw new Error(`${label} (${name}): This plan no longer exists. Refresh and try again.`);
    result.push({
      ...(existing ? { _id: existing._id } : {}),
      name, price: priceUsd, priceUsd, priceBdt, stockQuantity: null, secretCode: "", codes: [],
      supplier: { planId, period, locations, protocol, planName: price.planName, ips: price.ips || existing?.supplier?.ips || 1, costUsd: price.priceUsd, costCheckedAt: new Date() },
    });
  }
  return result;
}

function rebuildDelivery(supplierOrders) {
  const deliveredCodes = supplierOrders.flatMap((item) => item.proxies?.length ? item.proxies : [pendingLine(item)]);
  return { deliveredCodes, deliveredCode: deliveredCodes[0] || "", supplierDeliveryPending: supplierOrders.some((item) => !item.proxies?.length) };
}

async function loadProxies(supplierOrder) {
  try {
    const details = await orderDetails(supplierOrder.orderId);
    return { details: compactDetails(details), proxies: extractProxies(details) };
  } catch (error) {
    console.error(`MyProxyApi details for ${supplierOrder.orderId} failed:`, error.message);
    return { details: supplierOrder.details ?? null, proxies: supplierOrder.proxies || [] };
  }
}

async function acquireLock(orderId, statuses) {
  const now = new Date();
  return Order.findOneAndUpdate(
    { _id: orderId, source: "myproxyapi", status: { $in: statuses }, $or: [{ supplierLockUntil: null }, { supplierLockUntil: { $lt: now } }] },
    { $set: { supplierLockUntil: new Date(now.getTime() + LOCK_MS) } },
    { new: true },
  );
}

// Places the supplier orders for a paid order (status "processing") and delivers the proxies.
// It never throws for supplier problems: the error is saved on the order for the admin instead,
// so payment webhooks do not retry and risk ordering twice.
export async function fulfillSupplierOrder(orderId) {
  const order = await acquireLock(orderId, ["processing"]);
  if (!order) return;
  const release = (fields = {}) => Order.updateOne({ _id: order._id }, { $set: { supplierLockUntil: null, ...fields } });
  try {
    if (order.supplierUncertain) {
      await release({ supplierError: "A previous supplier request got no answer. Check the MyProxyApi panel for an order before retrying." });
      return;
    }
    const plan = order.supplierPlan || {};
    while (order.supplierOrders.length < (order.quantity || 1)) {
      let data;
      try {
        data = await placeOrder({ planId: plan.planId, period: plan.period, protocol: plan.protocol, locations: plan.locations, whitelistIp: order.whitelistIp });
      } catch (error) {
        const message = error instanceof SupplierError ? error.message : "Unexpected error while ordering from the supplier.";
        console.error(`MyProxyApi order failed for ${order._id}:`, error.message);
        await release({ supplierError: message, supplierUncertain: Boolean(error.uncertain) });
        return;
      }
      const entry = { orderId: String(data.order_id), planName: data.plan_name || plan.planName || "", priceUsd: Number(data.price_total) || 0, startTime: data.start_time || "", endTime: data.end_time || data.traffic_expire || "", proxies: [], details: null, placedAt: new Date() };
      // Saved right away so a crash or retry never orders the same unit twice.
      await Order.updateOne({ _id: order._id }, { $push: { supplierOrders: entry } });
      order.supplierOrders.push(entry);
    }
    const supplierOrders = [];
    for (const item of order.supplierOrders.map((entry) => entry.toObject?.() ?? entry)) {
      supplierOrders.push(item.proxies?.length ? item : { ...item, ...(await loadProxies(item)) });
    }
    await Order.updateOne({ _id: order._id }, { $set: {
      supplierOrders, ...rebuildDelivery(supplierOrders), status: "paid", paidAt: order.paidAt || new Date(),
      supplierError: "", supplierUncertain: false, supplierLockUntil: null, supplierCheckedAt: new Date(),
    } });
  } catch (error) {
    console.error(`Supplier fulfilment crashed for ${order._id}:`, error);
    await release({ supplierError: "Delivery stopped unexpectedly. Use Retry delivery." }).catch(() => {});
  }
}

// Background job: re-checks paid supplier orders whose proxy list was not ready yet.
export async function refreshSupplierDeliveries() {
  if (!supplierConfigured()) return 0;
  const orders = await Order.find({
    source: "myproxyapi", status: "paid", supplierDeliveryPending: true,
    paidAt: { $gte: new Date(Date.now() - DELIVERY_RETRY_WINDOW_MS) },
    $or: [{ supplierCheckedAt: null }, { supplierCheckedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } }],
  }, { _id: 1 }).limit(20).lean();
  for (const { _id } of orders) await refreshDelivery(_id);
  return orders.length;
}

async function refreshDelivery(orderId) {
  const order = await acquireLock(orderId, ["paid"]);
  if (!order) return;
  const supplierOrders = [];
  for (const item of order.supplierOrders.map((entry) => entry.toObject())) {
    supplierOrders.push(item.proxies?.length ? item : { ...item, ...(await loadProxies(item)) });
  }
  await Order.updateOne({ _id: order._id }, { $set: { supplierOrders, ...rebuildDelivery(supplierOrders), supplierLockUntil: null, supplierCheckedAt: new Date() } });
}

// ----- Admin endpoints -----

const supplierErrorResponse = (res, error) => res.status(502).json({ error: error.message || "The proxy supplier request failed." });

export async function supplierStatus(_req, res) {
  if (!supplierConfigured()) return res.json({ configured: false });
  try {
    const { account, reseller } = await accountInfo();
    res.json({ configured: true, username: account.username || "", discount: account.discount || "", balance: Number(reseller.available_balance) || 0, currency: reseller.currency || "USD", ordersCount: reseller.orders_count || 0, categories: SUPPLIER_CATEGORIES, periods: SUPPLIER_PERIODS });
  } catch (error) { res.json({ configured: true, error: error.message }); }
}

export async function supplierPlans(req, res) {
  try {
    const slug = String(req.query.category || "");
    const [plans, categories] = await Promise.all([listPlans(slug), listCategories().catch(() => [])]);
    res.json({ category: slug, storeCategory: SUPPLIER_CATEGORIES[slug], information: categories.find((item) => item.slug === slug)?.information || [], plans });
  } catch (error) { supplierErrorResponse(res, error); }
}

export async function supplierPrice(req, res) {
  try {
    const planId = Number(req.body?.planId);
    const period = String(req.body?.period || "");
    if (!Number.isInteger(planId) || planId <= 0 || !SUPPLIER_PERIODS.includes(period)) return res.status(400).json({ error: "A plan id and a valid period are required." });
    res.json({ price: await getPrice({ planId, period }) });
  } catch (error) { supplierErrorResponse(res, error); }
}

const importedProducts = {
  datacenter: { name: "Datacenter Proxy", codeNumber: "DC-PROXY" },
  isp: { name: "ISP Proxy", codeNumber: "ISP-PROXY" },
  "premium-isp": { name: "Premium ISP Proxy", codeNumber: "PISP-PROXY" },
  "static-residential": { name: "Static Residential Proxy", codeNumber: "SRES-PROXY" },
};
const IMPORT_PERIOD = "1";

// Lowest price among plans that have one; 0 when no plan is priced yet.
export function lowestSetPrice(variants, key) {
  const prices = variants.map((variant) => Number(variant[key]) || 0).filter((value) => value > 0);
  return prices.length ? Math.min(...prices) : 0;
}

const storeTypeOrder = ["datacenter", "isp", "premium-isp", "static-residential"];
const storeTypeLabels = { datacenter: "Private Proxy", isp: "ISP", "premium-isp": "Premium ISP", "static-residential": "Static Residential" };

// Public data for the proxy store page: every API proxy type with its plans (selling prices only,
// 0 = not priced yet) and the country → area → provider tree of available locations.
export async function listProxyStore(_req, res, next) {
  try {
    const products = await Product.find({ source: "myproxyapi", active: true, supplierCategory: { $in: storeTypeOrder } }).lean();
    const types = await Promise.all(storeTypeOrder.map(async (slug) => {
      const product = products.find((item) => item.supplierCategory === slug);
      if (!product) return null;
      let tree = { isps: [], countries: [] };
      let locationsError = false;
      try { tree = parseLocationTree(await listPlans(slug)); }
      catch (error) { locationsError = true; console.error(`Proxy store locations for ${slug} failed:`, error.message); }
      return {
        slug, label: storeTypeLabels[slug], productId: String(product._id), name: product.name, codeNumber: product.codeNumber, category: product.category,
        information: String(product.description || "").split(" · ").map((line) => line.trim()).filter(Boolean),
        plans: (product.variants || []).filter((variant) => variant.supplier?.planId).map((variant) => ({
          id: String(variant._id), name: variant.name, ips: variant.supplier?.ips || 1,
          priceUsd: Number(variant.priceUsd) || 0, priceBdt: Number(variant.priceBdt) || 0, chooseLocation: !variant.supplier?.locations,
        })).sort((a, b) => a.ips - b.ips),
        isps: tree.isps, countries: tree.countries, locationsError,
      };
    }));
    res.json({ types: types.filter(Boolean), maxQuantity: SUPPLIER_MAX_QUANTITY, available: supplierConfigured() });
  } catch (error) { next(error); }
}

let syncRunning = false;
// Keeps one product per supplier category holding every plan (1 month). Runs on server start, every
// few hours, and from the admin button. New plans arrive WITHOUT a price (customers see "Contact admin")
// until the admin sets one; existing prices are never changed.
export async function syncSupplierProducts(actor = "system") {
  if (!supplierConfigured()) throw new SupplierError("MyProxyApi is not configured on the server.");
  if (syncRunning) throw new SupplierError("A product sync is already running. Try again in a minute.");
  syncRunning = true;
  try {
    const summary = [];
    for (const [slug, storeCategory] of Object.entries(SUPPLIER_CATEGORIES)) {
      let category;
      try { category = parseCategory(await listPlans(slug, { fresh: true })); }
      catch (error) { summary.push({ category: slug, error: error.message }); continue; }
      let product = await Product.findOne({ source: "myproxyapi", supplierCategory: slug });
      const isNew = !product;
      if (!product) product = new Product({ ...importedProducts[slug], description: category.information.join(" · ").slice(0, 2000), category: storeCategory, source: "myproxyapi", supplierCategory: slug, price: 0, variants: [] });
      let added = 0;
      for (const plan of category.plans) {
        const existing = product.variants.find((variant) => variant.supplier?.planId === plan.id && variant.supplier?.period === IMPORT_PERIOD);
        let cost;
        try { cost = await getPrice({ planId: plan.id, period: IMPORT_PERIOD }); }
        catch (error) { console.error(`MyProxyApi price for plan ${plan.id} failed:`, error.message); continue; }
        if (existing) {
          existing.supplier.costUsd = cost.priceUsd;
          existing.supplier.costCheckedAt = new Date();
          existing.supplier.planName = cost.planName || plan.name;
          continue;
        }
        product.variants.push({
          name: `${plan.ips} ${plan.ips === 1 ? "IP" : "IPs"} · 1 Month`,
          price: 0, priceUsd: 0, priceBdt: 0,
          stockQuantity: null, secretCode: "", codes: [],
          supplier: { planId: plan.id, period: IMPORT_PERIOD, locations: "", protocol: "http", planName: cost.planName || plan.name, ips: plan.ips, costUsd: cost.priceUsd, costCheckedAt: new Date() },
        });
        added += 1;
      }
      if (!product.variants.length) { summary.push({ category: slug, error: "No plans could be priced." }); continue; }
      product.variants.sort((a, b) => (a.supplier?.ips || 0) - (b.supplier?.ips || 0));
      const lowestUsd = lowestSetPrice(product.variants, "priceUsd");
      Object.assign(product, { price: lowestUsd, priceUsd: lowestUsd, priceBdt: lowestSetPrice(product.variants, "priceBdt") });
      await product.save();
      if (isNew || added) await ProductActivity.create({ productId: String(product._id), productName: product.name, action: isNew ? "added" : "edited", adminEmail: actor, details: `${added} API plan(s) imported` });
      summary.push({ category: slug, product: product.name, created: isNew, added, total: product.variants.length });
    }
    return summary;
  } finally { syncRunning = false; }
}

export async function importSupplierProducts(req, res, next) {
  try { res.json({ summary: await syncSupplierProducts(String(req.user.email || "").toLowerCase()) }); }
  catch (error) { if (error instanceof SupplierError) return res.status(503).json({ error: error.message }); next(error); }
}

export async function retrySupplierDelivery(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const order = await Order.findOne({ _id: req.params.id, source: "myproxyapi" });
    if (!order) return res.status(404).json({ error: "Supplier order not found." });
    if (order.status === "processing") {
      if (order.supplierUncertain) {
        if (req.body?.confirmNotPlaced !== true) return res.status(409).json({ error: "The last supplier request got no answer, so an order may already exist there. Check the MyProxyApi panel first.", needsConfirmation: true });
        await Order.updateOne({ _id: order._id }, { $set: { supplierUncertain: false } });
      }
      await fulfillSupplierOrder(order._id);
    } else if (order.status === "paid") await refreshDelivery(order._id);
    else return res.status(409).json({ error: "Only paid or processing supplier orders can be delivered." });
    res.json({ order: await Order.findById(order._id).lean() });
  } catch (error) { next(error); }
}

// Lets the admin paste the proxies by hand when the supplier's order details cannot be read automatically.
export async function setSupplierDelivery(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid order id." });
    const lines = (typeof req.body?.lines === "string" ? req.body.lines.split(/\r?\n/) : []).map((line) => line.trim()).filter(Boolean);
    if (!lines.length || lines.length > 5000) return res.status(400).json({ error: "Paste between 1 and 5000 proxy lines." });
    const order = await Order.findOneAndUpdate({ _id: req.params.id, source: "myproxyapi", status: "paid" }, { $set: { deliveredCodes: lines, deliveredCode: lines[0], supplierDeliveryPending: false } }, { new: true }).lean();
    if (!order) return res.status(404).json({ error: "Paid supplier order not found." });
    res.json({ order });
  } catch (error) { next(error); }
}
