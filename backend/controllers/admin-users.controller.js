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
import { Wallet, WalletTransaction } from "../models/wallet.model.js";
import { Cart, Notification } from "../models/notification.model.js";
import { disconnectUser } from "../lib/realtime.js";
import { WalletError, creditWallet, debitWallet, topupCreditCents } from "../lib/wallet.js";

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

// Wallet credit: the admin finds a verified customer by user id, then adds money to their wallet.
async function findVerifiedUser(id) {
  const _id = toObjectId(String(id || "").trim());
  const user = _id ? await users().findOne({ _id }, { projection: { name: 1, email: 1, image: 1, phone: 1, emailVerified: 1, banned: 1, createdAt: 1 } }) : null;
  if (!user) return { status: 404, error: "No user has this id." };
  if (!user.emailVerified) return { status: 400, error: "This user has not verified their email. Only verified users can receive credit." };
  return { user };
}

export async function lookupUser(req, res, next) {
  try {
    const { user, status, error } = await findVerifiedUser(req.params.id);
    if (!user) return res.status(status).json({ error });
    const wallet = await Wallet.findOne({ userId: String(user._id) }, { balanceCents: 1 }).lean();
    res.json({ user: { id: String(user._id), name: user.name || "", email: user.email || "", image: user.image || "", phone: user.phone || "", banned: Boolean(user.banned), createdAt: user.createdAt, walletBalanceUsd: (wallet?.balanceCents || 0) / 100 } });
  } catch (error) { next(error); }
}

// Reads { amount, currency, note } for a credit or a take-back. BDT is converted to USD like a top-up.
function walletAmountInput(req) {
  const currency = req.body?.currency === "BDT" ? "BDT" : "USD";
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount more than zero." };
  if (amount > (currency === "BDT" ? 1_000_000 : 10_000)) return { error: "That amount is too large for one change." };
  const amountCents = topupCreditCents(amount, currency);
  if (!(amountCents > 0)) return { error: "The amount is less than one cent after conversion." };
  const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 200) : "";
  return { amountCents, options: { note, adminEmail: String(req.user.email || "").toLowerCase(), paidAmount: amount, paidCurrency: currency, bdtPerUsd: currency === "BDT" ? config.wallet.bdtPerUsd : 0 } };
}

export async function creditUserWallet(req, res, next) {
  try {
    const { user, status, error } = await findVerifiedUser(req.params.id);
    if (!user) return res.status(status).json({ error });
    const input = walletAmountInput(req);
    if (input.error) return res.status(400).json({ error: input.error });
    const { wallet } = await creditWallet(String(user._id), input.amountCents, input.options);
    res.json({ creditedUsd: input.amountCents / 100, walletBalanceUsd: wallet.balanceCents / 100 });
  } catch (error) { if (error instanceof WalletError) return res.status(error.status).json({ error: error.message }); next(error); }
}

// Takes credit back, for example a credit added by mistake. The balance never goes below zero.
export async function debitUserWallet(req, res, next) {
  try {
    const { user, status, error } = await findVerifiedUser(req.params.id);
    if (!user) return res.status(status).json({ error });
    const input = walletAmountInput(req);
    if (input.error) return res.status(400).json({ error: input.error });
    const { wallet } = await debitWallet(String(user._id), input.amountCents, input.options);
    res.json({ debitedUsd: input.amountCents / 100, walletBalanceUsd: wallet.balanceCents / 100 });
  } catch (error) { if (error instanceof WalletError) return res.status(error.status).json({ error: error.message }); next(error); }
}

// Finds verified users by user id, or by part of their name or email. At most 10 results.
export async function searchUsers(req, res, next) {
  try {
    const query = String(req.query.q || "").trim().slice(0, 100);
    if (query.length < 2) return res.status(400).json({ error: "Type at least 2 characters." });
    const projection = { name: 1, email: 1, image: 1, phone: 1, emailVerified: 1, banned: 1, createdAt: 1 };
    const _id = toObjectId(query);
    const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const found = await users().find({ emailVerified: true, $or: [...(_id ? [{ _id }] : []), { name: pattern }, { email: pattern }] }, { projection }).sort({ createdAt: -1 }).limit(10).toArray();
    const wallets = await Wallet.find({ userId: { $in: found.map((user) => String(user._id)) } }, { userId: 1, balanceCents: 1 }).lean();
    const balance = new Map(wallets.map((wallet) => [wallet.userId, wallet.balanceCents]));
    res.json({ users: found.map((user) => ({ id: String(user._id), name: user.name || "", email: user.email || "", phone: user.phone || "", banned: Boolean(user.banned), walletBalanceUsd: (balance.get(String(user._id)) || 0) / 100 })) });
  } catch (error) { next(error); }
}

// Latest wallet recharges (all methods), with the customer's name and email, for the admin Overview.
export async function recentTopups(_req, res, next) {
  try {
    const topups = await WalletTransaction.find({ type: { $in: ["topup", "credit", "debit"] } }).sort({ createdAt: -1 }).limit(30).lean();
    const ids = [...new Set(topups.map((item) => item.userId))].map(toObjectId).filter(Boolean);
    const people = await users().find({ _id: { $in: ids } }, { projection: { name: 1, email: 1 } }).toArray();
    const byId = new Map(people.map((person) => [String(person._id), person]));
    res.json({ topups: topups.map((item) => ({
      id: String(item._id), type: item.type, status: item.status, method: item.method,
      paidAmount: item.paidAmount || 0, paidCurrency: item.paidCurrency || "USD", creditedUsd: (item.amountCents || 0) / 100, bonusUsd: (item.bonusCents || 0) / 100,
      txid: item.cryptomusTxid || item.zinipayTransactionId || "", note: item.note || "", adminEmail: item.adminEmail || "",
      userName: byId.get(item.userId)?.name || "", userEmail: byId.get(item.userId)?.email || "",
      createdAt: item.createdAt, completedAt: item.completedAt,
    })) });
  } catch (error) { next(error); }
}
