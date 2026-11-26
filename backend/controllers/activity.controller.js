import mongoose from "mongoose";
import { UserActivity } from "../models/user-activity.model.js";
import { parseUserAgent } from "../lib/user-agent.js";

const MAX_EVENTS_PER_REQUEST = 30;
const clip = (value, length) => (typeof value === "string" ? value.trim().slice(0, length) : "");
// Only site paths are stored (no other sites), without fragments.
const sitePath = (value) => {
  const text = clip(value, 300);
  return text.startsWith("/") && !text.startsWith("//") ? text.split("#")[0] : "";
};

function deviceFields(userAgent, ip) {
  const ua = clip(userAgent, 400);
  return { ip: clip(ip, 64), userAgent: ua, ...parseUserAgent(ua) };
}

// Called from the auth session hook on every new sign-in. Never throws: logging must not block a sign-in.
export async function logLogin(session, context) {
  try {
    const path = String(context?.path || "");
    const method = path.startsWith("/callback/") ? `${(context?.params?.id || path.split("/")[2] || "social").replace(/^./, (c) => c.toUpperCase())}`
      : path.includes("email-otp") ? "Email code"
        : path.includes("sign-in/email") ? "Email & password"
          : path.includes("sign-up") ? "New account"
            : path.includes("oauth2") ? "Telegram / app"
              : "Sign-in";
    const userAgent = session.userAgent || context?.request?.headers?.get?.("user-agent") || "";
    await UserActivity.create({ userId: String(session.userId), type: "login", method, path: "", ...deviceFields(userAgent, session.ipAddress || "") });
  } catch (error) { console.error("Could not log sign-in:", error.message); }
}

// POST /api/activity  { events: [{ type: "page_view" | "click", path, label?, href?, at? }] }
// Sent by the browser in small batches. Visitors who are not signed in are not recorded.
export async function recordActivity(req, res, next) {
  try {
    if (!req.user) return res.json({ signedIn: false });
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
    const device = deviceFields(req.headers["user-agent"], req.ip);
    const now = Date.now();
    const docs = events.map((event) => {
      const type = event?.type === "click" ? "click" : event?.type === "page_view" ? "page_view" : "";
      const path = sitePath(event?.path);
      if (!type || !path) return null;
      // The browser's own time keeps the order right within a batch, but never more than 10 minutes back.
      const at = Number(event?.at);
      const createdAt = new Date(Number.isFinite(at) && at <= now && at > now - 10 * 60 * 1000 ? at : now);
      return { userId: String(req.user.id), type, path, label: type === "click" ? clip(event.label, 120) : "", href: type === "click" ? clip(event.href, 300) : "", createdAt, ...device };
    }).filter(Boolean);
    if (docs.length) await UserActivity.insertMany(docs, { ordered: false });
    res.json({ signedIn: true, saved: docs.length });
  } catch (error) { next(error); }
}

const users = () => mongoose.connection.collection("user");
const toObjectId = (id) => (mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === String(id) ? new mongoose.Types.ObjectId(id) : null);

// GET /admin/activity?userId=&type=login|page_view|click&before=<ISO date>
// Newest first, 100 at a time. With a userId it also lists the devices that customer has used.
export async function adminActivity(req, res, next) {
  try {
    const filter = {};
    const userId = clip(req.query.userId, 64);
    if (userId) filter.userId = userId;
    if (["login", "page_view", "click"].includes(req.query.type)) filter.type = req.query.type;
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    const limit = 100;
    const events = await UserActivity.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const more = events.length > limit;
    const shown = events.slice(0, limit);
    const ids = [...new Set(shown.map((event) => event.userId).concat(userId ? [userId] : []))];
    const people = await users().find({ _id: { $in: ids.map((id) => toObjectId(id) || id) } }, { projection: { name: 1, email: 1 } }).toArray();
    const byId = new Map(people.map((person) => [String(person._id), person]));
    let devices = null;
    let summary = null;
    if (userId) {
      devices = (await UserActivity.aggregate([
        { $match: { userId } },
        { $group: { _id: { device: "$device", browser: "$browser", os: "$os" }, lastSeen: { $max: "$createdAt" }, firstSeen: { $min: "$createdAt" }, logins: { $sum: { $cond: [{ $eq: ["$type", "login"] }, 1, 0] } }, events: { $sum: 1 }, ips: { $addToSet: "$ip" } } },
        { $sort: { lastSeen: -1 } },
        { $limit: 20 },
      ])).map((row) => ({ ...row._id, lastSeen: row.lastSeen, firstSeen: row.firstSeen, logins: row.logins, events: row.events, ips: row.ips.filter(Boolean).slice(0, 5) }));
      const counts = await UserActivity.aggregate([{ $match: { userId } }, { $group: { _id: "$type", count: { $sum: 1 } } }]);
      summary = Object.fromEntries(counts.map((row) => [row._id, row.count]));
    }
    res.json({
      user: userId ? { id: userId, name: byId.get(userId)?.name || "", email: byId.get(userId)?.email || "" } : null,
      events: shown.map((event) => ({
        id: String(event._id), userId: event.userId, userName: byId.get(event.userId)?.name || "", userEmail: byId.get(event.userId)?.email || "",
        type: event.type, path: event.path, label: event.label, href: event.href, method: event.method,
        device: event.device, browser: event.browser, os: event.os, ip: event.ip, createdAt: event.createdAt,
      })),
      nextBefore: more ? shown[shown.length - 1].createdAt : null,
      devices,
      summary,
    });
  } catch (error) { next(error); }
}
