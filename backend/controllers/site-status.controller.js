// Dev mode: while an admin has it on, every page shows a large "Site under maintenance" banner.
// The site keeps working; this is a notice, not the nginx maintenance page (deploy/maintenance.sh).
import { SiteSetting } from "../models/site-setting.model.js";

const KEY = "devMode";
const CACHE_MS = 5000;
let cached = null;
let cachedAt = 0;

async function readDevMode() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await SiteSetting.findOne({ key: KEY }).lean();
  cached = { on: Boolean(doc?.value?.on), message: String(doc?.value?.message || ""), updatedAt: doc?.updatedAt || null };
  cachedAt = Date.now();
  return cached;
}

export async function getSiteStatus(_req, res, next) {
  try {
    const devMode = await readDevMode();
    res.set("Cache-Control", "no-store");
    res.json({ devMode: { on: devMode.on, message: devMode.message } });
  } catch (error) { next(error); }
}

export async function adminGetSiteStatus(_req, res, next) {
  try {
    const doc = await SiteSetting.findOne({ key: KEY }).lean();
    res.json({ devMode: { on: Boolean(doc?.value?.on), message: String(doc?.value?.message || ""), updatedBy: doc?.updatedBy || "", updatedAt: doc?.updatedAt || null } });
  } catch (error) { next(error); }
}

export async function setDevMode(req, res, next) {
  try {
    const on = req.body?.on === true;
    const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 300) : "";
    const updatedBy = String(req.user.email || "").toLowerCase();
    const doc = await SiteSetting.findOneAndUpdate({ key: KEY }, { $set: { value: { on, message }, updatedBy } }, { upsert: true, returnDocument: "after" }).lean();
    cached = null;
    res.json({ devMode: { on, message, updatedBy, updatedAt: doc.updatedAt } });
  } catch (error) { next(error); }
}
