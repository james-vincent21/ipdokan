import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

function publicProfile(user) {
  return { id: user.id, name: user.name, email: user.email, image: user.image || "", phone: user.phone || "", createdAt: user.createdAt };
}

export function getProfile(req, res) {
  res.json({ user: publicProfile(req.user) });
}

export async function updateProfile(req, res, next) {
  try {
    const update = {};
    if (Object.hasOwn(req.body, "name")) {
      if (typeof req.body.name !== "string" || req.body.name.trim().length < 2 || req.body.name.trim().length > 80) return res.status(400).json({ error: "Name must be between 2 and 80 characters." });
      update.name = req.body.name.trim();
    }
    if (Object.hasOwn(req.body, "phone")) {
      if (typeof req.body.phone !== "string" || req.body.phone.trim().length > 32) return res.status(400).json({ error: "Phone number must be 32 characters or fewer." });
      update.phone = req.body.phone.trim();
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: "No profile fields to update." });
    if (req.authMethod === "bearer") {
      Object.assign(req.user, update);
      await req.user.save();
      return res.json({ user: publicProfile(req.user) });
    }
    await auth.api.updateUser({ headers: fromNodeHeaders(req.headers), body: update });
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    res.json({ user: publicProfile(session.user) });
  } catch (error) { next(error); }
}
