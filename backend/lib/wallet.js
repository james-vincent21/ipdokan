import mongoose from "mongoose";
import { config } from "../config/env.js";
import { Wallet, WalletTransaction } from "../models/wallet.model.js";
import { Order } from "../models/order.model.js";
import { notifyWalletCredit, notifyWalletDebit, notifyWalletRefund, notifyWalletTopup } from "./order-notifications.js";

export class WalletError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const toCents = (usd) => Math.round(Number(usd) * 100);
export const fromCents = (cents) => Math.round(cents) / 100;

// USD credited for a top-up. BDT is converted at the rate saved on the top-up, rounded down to the cent.
export function topupCreditCents(amount, currency, bdtPerUsd = config.wallet.bdtPerUsd) {
  return currency === "BDT" ? Math.floor((Number(amount) / bdtPerUsd) * 100 + 1e-9) : toCents(amount);
}

// Bonus for a recharge: `percent` of the credited amount when the recharge reaches the threshold.
export function topupBonusCents(amount, currency, creditCents, bonus = config.wallet.bonus) {
  if (!(bonus.percent > 0) || !(Number(amount) + 1e-9 >= bonus.threshold[currency])) return 0;
  return Math.floor((creditCents * bonus.percent) / 100 + 1e-9);
}

export async function walletBalanceCents(userId) {
  const wallet = await Wallet.findOne({ userId }, { balanceCents: 1 }).lean();
  return wallet?.balanceCents || 0;
}

async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally { await session.endSession(); }
}

// Marks a pending top-up as completed and adds it to the balance, both or neither. Calling it again for
// the same top-up (webhook + return page) does nothing, so a payment is never credited twice.
export async function completeTopup(transactionId, gatewayFields = {}) {
  let completed = null;
  const wallet = await inTransaction(async (session) => {
    const transaction = await WalletTransaction.findOneAndUpdate(
      { _id: transactionId, type: "topup", status: "pending" },
      { $set: { status: "completed", completedAt: new Date(), ...gatewayFields } },
      { session, returnDocument: "after" },
    );
    if (!transaction) return null;
    const wallet = await Wallet.findOneAndUpdate(
      { userId: transaction.userId },
      { $inc: { balanceCents: transaction.amountCents } },
      { session, upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    await WalletTransaction.updateOne({ _id: transaction._id }, { $set: { balanceAfterCents: wallet.balanceCents } }, { session });
    console.log(`Wallet top-up ${transaction._id} completed: +$${fromCents(transaction.amountCents)} for user ${transaction.userId}, balance $${fromCents(wallet.balanceCents)}.`);
    completed = transaction;
    return wallet;
  });
  // Sent after the database transaction commits, so a retried transaction never notifies twice.
  if (completed && wallet) notifyWalletTopup(completed, wallet.balanceCents);
  return wallet;
}

export async function failTopup(transactionId, note) {
  await WalletTransaction.updateOne({ _id: transactionId, type: "topup", status: "pending" }, { $set: { status: "failed", note: String(note || "").slice(0, 300) } });
}

// Puts money back into the wallet, for example when an order paid from it could not be delivered.
export async function refundToWallet(userId, amountCents, orderIds, note) {
  if (!(amountCents > 0)) return null;
  const wallet = await inTransaction(async (session) => {
    const updated = await Wallet.findOneAndUpdate({ userId }, { $inc: { balanceCents: amountCents } }, { session, upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
    await WalletTransaction.create([{ userId, type: "refund", status: "completed", method: "wallet", amountCents, balanceAfterCents: updated.balanceCents, orderIds, note, completedAt: new Date() }], { session });
    return updated;
  });
  if (wallet) notifyWalletRefund(userId, amountCents, wallet.balanceCents);
  return wallet;
}

// Money an admin adds to a customer's wallet by hand. Balance and record are saved together.
export async function creditWallet(userId, amountCents, { note = "", adminEmail = "", paidAmount = 0, paidCurrency = "USD", bdtPerUsd = 0 } = {}) {
  if (!(amountCents > 0)) throw new WalletError("Amount must be more than zero.");
  const result = await inTransaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate({ userId }, { $inc: { balanceCents: amountCents } }, { session, upsert: true, returnDocument: "after", setDefaultsOnInsert: true });
    const [transaction] = await WalletTransaction.create([{ userId, type: "credit", status: "completed", method: "admin", amountCents, balanceAfterCents: wallet.balanceCents, paidAmount, paidCurrency, bdtPerUsd, note: String(note).slice(0, 300), adminEmail, completedAt: new Date() }], { session });
    return { wallet, transaction };
  });
  notifyWalletCredit(userId, amountCents, result.wallet.balanceCents, note);
  return result;
}

// Money an admin takes back from a customer's wallet. Only what is in the balance can be taken.
export async function debitWallet(userId, amountCents, { note = "", adminEmail = "", paidAmount = 0, paidCurrency = "USD", bdtPerUsd = 0 } = {}) {
  if (!(amountCents > 0)) throw new WalletError("Amount must be more than zero.");
  const result = await inTransaction(async (session) => {
    const wallet = await Wallet.findOneAndUpdate({ userId, balanceCents: { $gte: amountCents } }, { $inc: { balanceCents: -amountCents } }, { session, returnDocument: "after" });
    if (!wallet) {
      const current = await Wallet.findOne({ userId }, { balanceCents: 1 }, { session }).lean();
      throw new WalletError(`The wallet has only $${((current?.balanceCents || 0) / 100).toFixed(2)}. You cannot take back more than that.`, 409);
    }
    const [transaction] = await WalletTransaction.create([{ userId, type: "debit", status: "completed", method: "admin", amountCents: -amountCents, balanceAfterCents: wallet.balanceCents, paidAmount, paidCurrency, bdtPerUsd, note: String(note).slice(0, 300), adminEmail, completedAt: new Date() }], { session });
    return { wallet, transaction };
  });
  notifyWalletDebit(userId, amountCents, result.wallet.balanceCents, note);
  return result;
}

// Pays pending USD orders from the wallet. The orders are claimed and the balance is charged in one
// database transaction, so the same orders or the same money can never be used twice.
export async function chargeWalletForOrders(userId, orderIds, expiryMs) {
  const orders = await Order.find({ _id: { $in: orderIds }, userId, status: "pending" });
  if (orders.length !== orderIds.length) throw new WalletError("One or more pending orders were not found.", 404);
  if (orders.some((order) => order.currency !== "USD")) throw new WalletError("Wallet payments are made in USD. Choose the wallet before placing the order.");
  if (orders.some((order) => order.walletTransactionId)) throw new WalletError("These orders are already being paid from your wallet.", 409);
  if (orders.some((order) => order.createdAt < new Date(Date.now() - expiryMs))) throw new WalletError("This order has expired. Please place the order again.", 409);
  const totalCents = orders.reduce((sum, order) => sum + toCents(order.amount), 0);
  if (!(totalCents > 0)) throw new WalletError("The order total must be greater than zero.");

  return inTransaction(async (session) => {
    const transactionId = new mongoose.Types.ObjectId();
    const claimed = await Order.updateMany(
      { _id: { $in: orderIds }, userId, status: "pending", walletTransactionId: "" },
      { $set: { walletTransactionId: String(transactionId), paymentStartedAt: new Date() } },
      { session },
    );
    if (claimed.modifiedCount !== orderIds.length) throw new WalletError("These orders are already being paid. Refresh the page.", 409);
    const wallet = await Wallet.findOneAndUpdate(
      { userId, balanceCents: { $gte: totalCents } },
      { $inc: { balanceCents: -totalCents } },
      { session, returnDocument: "after" },
    );
    if (!wallet) {
      const balance = fromCents(await walletBalanceCents(userId));
      throw new WalletError(`Your wallet balance ($${balance.toFixed(2)}) is not enough for this payment ($${fromCents(totalCents).toFixed(2)}). Recharge your wallet first.`, 402);
    }
    await WalletTransaction.create([{
      _id: transactionId, userId, type: "purchase", status: "completed", method: "wallet",
      amountCents: -totalCents, balanceAfterCents: wallet.balanceCents, orderIds: orders.map((order) => order._id), completedAt: new Date(),
    }], { session });
    return { transactionId: String(transactionId), orders, totalCents };
  });
}
