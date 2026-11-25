// Admin: ban, unban and delete customer accounts.
//   Ban     signs the user out everywhere (sessions in MongoDB and Redis, open tabs) and blocks every
//           future sign-in (email, Google, OTP) until unbanned; see databaseHooks in lib/auth.js.
//   Delete  removes the account, its sign-in methods, sessions, cart and notifications. Orders and
//           wallet history are kept for the records (orders keep the customer's name and email).
// Admin accounts and your own account cannot be banned or deleted.
import mongoose from "mongoose";
import { auth } from "../lib/auth.js";
import { config } from "../config/env.js";
import { AdminEmail } from "../models/admin-email.model.js";
import { Wallet } from "../models/wallet.model.js";
import { Cart, Notification } from "../models/notification.model.js";
import { disconnectUser } from "../lib/realtime.js";

const users = () => mongoose.connection.collection("user");
const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null);

async function findTarget(req, res) {
  const _id = toObjectId(req.params.id);
  const user = _id ? await users().findOne({ _id }) : null;
  if (!user) { res.status(404).json({ error: "User not found." }); return null; }
  const email = String(user.email || "").toLowerCase();
  if (String(user._id) === String(req.user.id || req.user._id)) { res.status(400).json({ error: "You cannot do this to your own account." }); return null; }
  if (config.adminEmails.includes(email) || await AdminEmail.exists({ email })) {
    res.status(400).json({ error: "This is an admin account. Remove its admin access first." });
    return null;
  }
  return user;
}

async function signOutEverywhere(userId) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(String(userId));
  disconnectUser(String(userId));
}

export async function banUser(req, res, next) {
  try {
    const user = await findTarget(req, res);
    if (!user) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 200) : "";
    await users().updateOne({ _id: user._id }, { $set: { banned: true, banReason: reason, bannedAt: new Date(), bannedBy: String(req.user.email || "").toLowerCase(), updatedAt: new Date() } });
    await signOutEverywhere(user._id);
    res.json({ banned: true });
  } catch (error) { next(error); }
}

export async function unbanUser(req, res, next) {
  try {
    const user = await findTarget(req, res);
    if (!user) return;
    await users().updateOne({ _id: user._id }, { $set: { banned: false, updatedAt: new Date() }, $unset: { banReason: "", bannedAt: "", bannedBy: "" } });
    res.json({ banned: false });
  } catch (error) { next(error); }
}

export async function deleteUser(req, res, next) {
  try {
    const user = await findTarget(req, res);
    if (!user) return;
    const userId = String(user._id);
    const wallet = await Wallet.findOne({ userId }).lean();
    if (wallet?.balanceCents > 0 && req.query.confirmBalance !== "1") {
      return res.status(409).json({ error: `This user has $${(wallet.balanceCents / 100).toFixed(2)} in their wallet. Confirm again to delete anyway.`, walletBalanceUsd: wallet.balanceCents / 100 });
    }
    await signOutEverywhere(userId);
    const ctx = await auth.$context;
    await ctx.internalAdapter.deleteUser(userId); // user, accounts (password / Google), sessions
    const db = mongoose.connection.db;
    await Promise.all([
      Cart.deleteMany({ userId }),
      Notification.deleteMany({ userId }),
      // OAuth (bot / API) tokens and consents
      ...["oauthAccessToken", "oauthRefreshToken", "oauthConsent"].map((name) => db.collection(name).deleteMany({ userId: { $in: [user._id, userId] } })),
    ]);
    res.json({ deleted: true });
  } catch (error) { next(error); }
}
