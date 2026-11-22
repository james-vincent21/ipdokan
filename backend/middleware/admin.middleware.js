import { config } from "../config/env.js";
import { AdminEmail } from "../models/admin-email.model.js";

export async function requireAdmin(req, res, next) {
  const email = String(req.user?.email || "").toLowerCase();
  if (!email) return res.status(403).json({ error: "Admin access required." });
  try {
    if (config.adminEmails.includes(email) || await AdminEmail.exists({ email })) return next();
    if (!config.adminEmails.length && !(await AdminEmail.exists({}))) return res.status(503).json({ error: "Admin access is not configured. Add the first admin email to ADMIN_EMAILS, then manage admins in the panel." });
    return res.status(403).json({ error: "Admin access required." });
  } catch (error) { next(error); }
}
