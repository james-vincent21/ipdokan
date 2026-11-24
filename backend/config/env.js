import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnvPath)) {
  for (const line of readFileSync(rootEnvPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const authEnabled = process.env.AUTH_ENABLED === "true";
const mongoUri = process.env.MONGODB_URI || "";
const betterAuthSecret = process.env.BETTER_AUTH_SECRET || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const zinipayApiKey = process.env.ZINIPAY_API_KEY || "";
const zinipayBaseUrl = (process.env.ZINIPAY_BASE_URL || "https://api.zinipay.com").replace(/\/+$/, "");
const cryptomusMerchantId = process.env.CRYPTOMUS_MERCHANT_ID || "";
const cryptomusPaymentKey = process.env.CRYPTOMUS_PAYMENT_KEY || "";
const cryptomusEnabled = Boolean(cryptomusMerchantId && cryptomusPaymentKey);
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || "";
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || "";
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || "";
const demoPaymentEnabled = process.env.NODE_ENV !== "production" && !stripeSecretKey && !zinipayApiKey && !cryptomusEnabled;

if (authEnabled && (!mongoUri || !betterAuthSecret || betterAuthSecret.length < 32)) {
  throw new Error("AUTH_ENABLED=true requires MONGODB_URI and a BETTER_AUTH_SECRET of at least 32 characters.");
}

// Service + additional fee charged on top of the product price, in percent.
const serviceFeePercent = process.env.SERVICE_FEE_PERCENT === undefined || process.env.SERVICE_FEE_PERCENT === "" ? 5 : Number(process.env.SERVICE_FEE_PERCENT);
if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 50) throw new Error("SERVICE_FEE_PERCENT must be a number from 0 to 50.");

const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const authUrl = process.env.BETTER_AUTH_URL || "http://localhost:4000";
const demoAdminEnabled = process.env.DEMO_ADMIN_ENABLED === "true";
const demoAdminEmail = process.env.DEMO_ADMIN_EMAIL || "";
const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD || "";
if (demoAdminEnabled && process.env.NODE_ENV === "production") throw new Error("Demo admin accounts are disabled in production.");
if (demoAdminEnabled && (!demoAdminEmail || (demoAdminPassword && demoAdminPassword.length < 10))) throw new Error("DEMO_ADMIN_ENABLED=true requires DEMO_ADMIN_EMAIL; any configured DEMO_ADMIN_PASSWORD must be at least 10 characters.");

export const config = {
  port: Number(process.env.API_PORT || 4000),
  frontendOrigin,
  serviceFeePercent,
  authEnabled,
  mongoUri,
  mongoDatabase: process.env.MONGODB_DATABASE || "ipdokan",
  betterAuthSecret,
  stripeSecretKey,
  stripeWebhookSecret,
  demoPaymentEnabled,
  zinipayApiKey,
  zinipayBaseUrl,
  cryptomusMerchantId,
  cryptomusPaymentKey,
  cryptomusEnabled,
  // Cloudinary: product images uploaded from the admin panel.
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  cloudinaryEnabled: Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret),
  // MyProxyApi reseller API: proxies sold from it are ordered automatically after payment.
  myproxyapiBaseUrl: (process.env.MYPROXYAPI_BASE_URL || "https://reseller.myproxyapi.com/api/v1").replace(/\/+$/, ""),
  myproxyapiUsername: process.env.MYPROXYAPI_USERNAME || "",
  myproxyapiSecret: process.env.MYPROXYAPI_SECRET || "",
  myproxyapiUserId: Number(process.env.MYPROXYAPI_USER_ID) || 0,
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  authUrl,
  apiResource: process.env.API_RESOURCE || `${authUrl}/api`,
  adminEmails: [...new Set([
    // Permanent owner account; it cannot be removed from the admin panel.
    "xavierjames701@gmail.com",
    ...(process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    ...(demoAdminEnabled ? [demoAdminEmail.toLowerCase()] : []),
  ])],
  demoAdminEnabled,
  demoAdminEmail,
  demoAdminPassword,
  demoAdminName: process.env.DEMO_ADMIN_NAME || "Demo Admin",
};
