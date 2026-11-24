import { createHash } from "node:crypto";
import { config } from "../config/env.js";

// Signed uploads to Cloudinary's REST API. The API secret never leaves the server.
// Docs: https://cloudinary.com/documentation/upload_images#generating_authentication_signatures
export const PRODUCT_IMAGE_FOLDER = "ipdokan/products";

export class CloudinaryError extends Error {}

export const cloudinaryConfigured = () => config.cloudinaryEnabled;

function sign(params) {
  const toSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join("&");
  return createHash("sha1").update(toSign + config.cloudinaryApiSecret).digest("hex");
}

// Uploads one image and returns its HTTPS URL.
export async function uploadImage(buffer, mimeType, folder = PRODUCT_IMAGE_FOLDER) {
  if (!cloudinaryConfigured()) throw new CloudinaryError("Cloudinary is not configured on the server.");
  const params = { folder, timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), "product-image");
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append("api_key", config.cloudinaryApiKey);
  form.append("signature", sign(params));
  let response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudinaryCloudName)}/image/upload`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new CloudinaryError(`Cloudinary is unreachable: ${error.message}`);
  }
  let result = null;
  try { result = await response.json(); } catch { /* Non-JSON body. */ }
  if (!response.ok || !result?.secure_url) throw new CloudinaryError(result?.error?.message || `Cloudinary upload failed (HTTP ${response.status}).`);
  return { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes };
}
