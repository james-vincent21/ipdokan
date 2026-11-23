// Client for the MyProxyApi reseller API (https://reseller.myproxyapi.com/api/v1/).
// Every call goes through `request`, which handles the bearer token and the API's
// habit of returning HTTP 200 with an error code in the JSON `status` field.
import { config } from "../config/env.js";

export const SUPPLIER = "myproxyapi";
// Categories this store resells, mapped to the store's own navigation categories.
export const SUPPLIER_CATEGORIES = {
  datacenter: "Private Proxy",
  isp: "Monthly ISP Proxy",
  "premium-isp": "Monthly ISP Proxy",
  "static-residential": "Residential Static Proxy",
};
// Valid `period` values for static IP plans (months, or 1d / 1w).
export const SUPPLIER_PERIODS = ["1d", "1w", "1", "3", "6", "12"];
export const SUPPLIER_PROTOCOLS = ["http", "socks5"];

export class SupplierError extends Error {
  constructor(message, { status = 0, details = null, uncertain = false } = {}) {
    super(message);
    this.name = "SupplierError";
    this.status = status;
    this.details = details;
    // True when the request may have reached the supplier (timeout, network drop),
    // so an order might exist there even though we have no response.
    this.uncertain = uncertain;
  }
}

let cachedToken = { value: "", expiresAt: 0 };
let cachedUserId = { value: 0, expiresAt: 0 };

export function supplierConfigured() {
  return Boolean(config.myproxyapiUsername && config.myproxyapiSecret);
}

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (Number.isFinite(payload.exp)) return payload.exp * 1000 - 5 * 60 * 1000;
  } catch { /* Not a JWT; fall back to a short cache. */ }
  return Date.now() + 60 * 60 * 1000;
}

async function rawRequest(path, { method = "GET", body, token, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${config.myproxyapiBaseUrl}/${path}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new SupplierError(error.name === "AbortError" ? "The proxy supplier did not respond in time." : "Could not reach the proxy supplier.", { uncertain: method !== "GET" });
  } finally { clearTimeout(timer); }
  let result = null;
  try { result = await response.json(); } catch { /* Non-JSON body. */ }
  const status = Number(result?.status) || response.status;
  if (!response.ok || status >= 400 || !result) {
    const errors = Array.isArray(result?.errors) ? ` ${result.errors.join(" ")}` : "";
    throw new SupplierError(`${result?.message || `Supplier request failed (HTTP ${response.status}).`}${errors}`, { status, details: result?.data ?? null, uncertain: !result && method !== "GET" });
  }
  return result;
}

async function getToken(force = false) {
  if (!supplierConfigured()) throw new SupplierError("MyProxyApi is not configured. Set MYPROXYAPI_USERNAME and MYPROXYAPI_SECRET.");
  if (!force && cachedToken.value && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const result = await rawRequest("getToken", { method: "POST", body: { username: config.myproxyapiUsername, secret: config.myproxyapiSecret } });
  const token = result?.data?.token;
  if (!token) throw new SupplierError("The proxy supplier did not return an access token.");
  cachedToken = { value: token, expiresAt: tokenExpiry(token) };
  return token;
}

export async function request(path, options = {}) {
  const token = await getToken();
  try { return await rawRequest(path, { ...options, token }); }
  catch (error) {
    if (error.status !== 401) throw error;
    return rawRequest(path, { ...options, token: await getToken(true) });
  }
}

export async function accountInfo() {
  const result = await request("account-info");
  return { account: result.reseller_account || {}, reseller: result.data?.reseller || {} };
}

export async function availableBalanceUsd() {
  const { reseller } = await accountInfo();
  return Number(reseller.available_balance) || 0;
}

// Orders are placed for the reseller's own account unless MYPROXYAPI_USER_ID names a sub-user.
export async function supplierUserId() {
  if (config.myproxyapiUserId) return config.myproxyapiUserId;
  if (cachedUserId.value && cachedUserId.expiresAt > Date.now()) return cachedUserId.value;
  const { account } = await accountInfo();
  const id = Number(account.id);
  if (!Number.isInteger(id) || id <= 0) throw new SupplierError("Could not read the reseller account id from the supplier.");
  cachedUserId = { value: id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return id;
}

export async function listCategories() {
  return (await request("products-categories")).data || [];
}

const planCache = new Map();
// Raw category listing: [{ name, information, proxy_plans: [...], isp: [{ name, locations: { CC: { name, cities } } }] }].
// Cached briefly because the public catalog reads locations from it.
export async function listPlans(categorySlug, { fresh = false } = {}) {
  if (!Object.hasOwn(SUPPLIER_CATEGORIES, categorySlug)) throw new SupplierError("Unsupported supplier category.");
  const cached = planCache.get(categorySlug);
  if (!fresh && cached && cached.expiresAt > Date.now()) return cached.data;
  const data = (await request(`products/${categorySlug}`)).data ?? [];
  planCache.set(categorySlug, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
  return data;
}

export function parseCategory(data) {
  const category = (Array.isArray(data) ? data[0] : data) || {};
  const isps = category.isp || [];
  const locations = isps.flatMap((isp) => Object.values(isp.locations || {}).flatMap((country) => (country.cities || []).map((city) => ({
    id: String(city.id),
    name: `${country.name} · ${city.name}${city.state && city.state !== city.name ? `, ${city.state}` : ""}${isps.length > 1 ? ` · ${isp.name}` : ""}`,
    stock: Number(city.ips_available) || 0,
  })))).filter((location) => location.id).sort((a, b) => a.name.localeCompare(b.name));
  const plans = (category.proxy_plans || []).map((plan) => ({ id: Number(plan.id), name: String(plan.name || ""), listPriceUsd: Number(plan.price) || 0, ips: Number(plan.ips_included) || 1 })).filter((plan) => plan.id > 0);
  const information = (category.information || []).flatMap((line) => String(line).split(/\n/)).map((line) => line.trim()).filter(Boolean);
  return { name: category.name || "", information, plans, locations };
}

// Country → area (city) → providers, for the proxy store's location picker. Each provider entry
// carries its own supplier location id, because the same city has a different id per ISP.
export function parseLocationTree(data) {
  const category = (Array.isArray(data) ? data[0] : data) || {};
  const countries = new Map();
  const isps = [];
  for (const isp of category.isp || []) {
    if (isp.name && !isps.includes(isp.name)) isps.push(isp.name);
    for (const [code, country] of Object.entries(isp.locations || {})) {
      if (!countries.has(code)) countries.set(code, { code, name: country.name || code, stock: 0, cities: new Map() });
      const countryEntry = countries.get(code);
      for (const city of country.cities || []) {
        if (!city?.id) continue;
        const key = `${city.name}|${city.state || ""}`;
        if (!countryEntry.cities.has(key)) countryEntry.cities.set(key, { key, name: city.name, state: city.state && city.state !== city.name ? city.state : "", stock: 0, providers: [] });
        const cityEntry = countryEntry.cities.get(key);
        const stock = Number(city.ips_available) || 0;
        cityEntry.providers.push({ locationId: String(city.id), isp: isp.name || "Provider", stock });
        cityEntry.stock += stock;
        countryEntry.stock += stock;
      }
    }
  }
  return {
    isps: isps.sort((a, b) => a.localeCompare(b)),
    countries: [...countries.values()].map((country) => ({
      ...country,
      cities: [...country.cities.values()].map((city) => ({ ...city, providers: city.providers.sort((a, b) => b.stock - a.stock) })).sort((a, b) => a.name.localeCompare(b.name)),
    })).sort((a, b) => b.stock - a.stock),
  };
}

export async function categoryLocations(categorySlug) {
  return parseCategory(await listPlans(categorySlug)).locations;
}

export async function getPrice({ planId, period }) {
  const result = await request("products/get-price", { method: "POST", body: { user_id: await supplierUserId(), product: planId, period: String(period) } });
  const data = result.data || {};
  const total = Number(data.price_total);
  if (!Number.isFinite(total)) throw new SupplierError("The supplier returned an invalid price.");
  return { planName: data.plan_name || "", ips: Number(data.ips) || 0, period: data.period, periodUnit: data.period_unit || "", priceUsd: total, currency: data.currency || "USD" };
}

export async function placeOrder({ planId, period, protocol, locations, whitelistIp }) {
  const result = await request("products/place-order", {
    method: "POST",
    timeoutMs: 60000,
    body: { user_id: await supplierUserId(), product: planId, period: String(period), protocol, locations: String(locations), whitelist_ip: whitelistIp },
  });
  const data = result.data || {};
  if (!data.order_id) throw new SupplierError("The supplier accepted the order but returned no order id.", { uncertain: true });
  return data;
}

export async function orderDetails(orderId) {
  return (await request(`orders/view/${encodeURIComponent(orderId)}`)).data ?? null;
}

const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
export const isIpv4 = (value) => typeof value === "string" && ipv4.test(value.trim());

// The order-details response format is not documented, so proxies are found by shape:
// any object with an ip/host and a port, or any "ip:port[:user:pass]" string.
export function extractProxies(details) {
  const found = [];
  const seen = new Set();
  const add = (line) => { if (line && !seen.has(line)) { seen.add(line); found.push(line); } };
  const pick = (object, keys) => keys.map((key) => object[key]).find((value) => value !== undefined && value !== null && value !== "");
  const walk = (node, inherited) => {
    if (found.length >= 5000 || node === null || node === undefined) return;
    if (typeof node === "string") {
      if (/^\d{1,3}(\.\d{1,3}){3}:\d{2,5}(:[^\s:]+:[^\s:]+)?$/.test(node.trim())) add(node.trim());
      return;
    }
    if (Array.isArray(node)) { node.forEach((item) => walk(item, inherited)); return; }
    if (typeof node !== "object") return;
    const username = pick(node, ["username", "user", "login", "proxy_username", "auth_username"]) ?? inherited.username;
    const password = pick(node, ["password", "pass", "proxy_password", "auth_password"]) ?? inherited.password;
    const host = pick(node, ["ip", "host", "proxy_ip", "address", "hostname"]);
    const port = pick(node, ["port", "proxy_port", "http_port", "socks_port", "socks5_port"]);
    if (host && port && (isIpv4(String(host)) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(host)))) {
      add([host, port, username, password].filter((part) => part !== undefined && part !== null && part !== "").join(":"));
      return;
    }
    for (const value of Object.values(node)) walk(value, { username, password });
  };
  walk(details, {});
  return found;
}
