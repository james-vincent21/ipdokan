import { CloudinaryError, cloudinaryConfigured, uploadImage } from "../lib/cloudinary.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// The first bytes of each allowed format, so a renamed non-image file is refused.
function looksLikeImage(buffer) {
  const hex = buffer.subarray(0, 12).toString("hex");
  const ascii = buffer.subarray(0, 12).toString("latin1");
  return hex.startsWith("ffd8ff") // JPEG
    || hex.startsWith("89504e470d0a1a0a") // PNG
    || ascii.startsWith("GIF8") // GIF
    || (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") // WebP
    || ascii.slice(4, 12).startsWith("ftypavi"); // AVIF
}

// Admin: the raw image is the request body. Returns the Cloudinary URL; the admin form saves it
// as the product's imageUrl when the product is saved.
export async function uploadProductImage(req, res, next) {
  try {
    if (!cloudinaryConfigured()) return res.status(503).json({ error: "Image upload is not configured. Add the CLOUDINARY_* settings to .env and restart the API." });
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.includes(type)) return res.status(415).json({ error: "Upload a JPG, PNG, WebP, GIF or AVIF image." });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "The image file is empty." });
    if (!looksLikeImage(req.body)) return res.status(415).json({ error: "That file is not a valid image." });
    const image = await uploadImage(req.body, type);
    res.status(201).json({ url: image.url, width: image.width, height: image.height, bytes: image.bytes });
  } catch (error) {
    if (error instanceof CloudinaryError) {
      console.error("Cloudinary upload failed:", error.message);
      return res.status(502).json({ error: "The image could not be uploaded. Please try again." });
    }
    next(error);
  }
}

// express.raw rejects bodies over the limit with a 413 before the handler runs; this turns it into JSON.
export function imageTooLarge(error, _req, res, next) {
  if (error?.type === "entity.too.large") return res.status(413).json({ error: `The image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.` });
  next(error);
}
