import mongoose from "mongoose";
import { config } from "../config/env.js";
import { WalletTransaction } from "../models/wallet.model.js";
import { Order } from "../models/order.model.js";
import { WalletError, chargeWalletForOrders, fromCents, refundToWallet, toCents, topupCreditCents, walletBalanceCents } from "../lib/wallet.js";
import { fulfillPaidOrder, PENDING_ORDER_EXPIRY_MS } from "./store.controller.js";
import { settleZinipayTopup, startZinipayTopup } from "./zinipay.controller.js";
import { settleCryptomusTopup, startCryptomusTopup } from "./cryptomus.controller.js";

// BDT top-ups are paid with ZiniPay, USD top-ups with Cryptomus.
const TOPUP_METHOD = { BDT: "zinipay", USD: "cryptomus" };

const methodAvailable = (currency) => currency === "BDT" ? Boolean(config.zinipayApiKey) : config.cryptomusEnabled;

function publicTransaction(transaction) {
  return {
    id: String(transaction._id), type: transaction.type, status: transaction.status, method: transaction.method,
    amountUsd: fromCents(transaction.amountCents), balanceAfterUsd: transaction.balanceAfterCents === null ? null : fromCents(transaction.balanceAfterCents),
    paidAmount: transaction.paidAmount || 0, paidCurrency: transaction.paidCurrency, bdtPerUsd: transaction.bdtPerUsd || 0,
    orderCount: transaction.orderIds?.length || 0, note: transaction.note || "", createdAt: transaction.createdAt, completedAt: transaction.completedAt,
  };
}

function walletErrorResponse(res, error, next) {
  if (error instanceof WalletError) return res.status(error.status).json({ error: error.message });
  next(error);
}

export async function getWallet(req, res, next) {
  try {
    const [balanceCents, transactions] = await Promise.all([
      walletBalanceCents(req.user.id),
      WalletTransaction.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    const balanceUsd = fromCents(balanceCents);
    res.json({
      balanceUsd, balanceBdt: Math.round(balanceUsd * config.wallet.bdtPerUsd * 100) / 100,
      bdtPerUsd: config.wallet.bdtPerUsd, minTopup: config.wallet.minTopup, maxTopup: config.wallet.maxTopup,
      methods: { USD: methodAvailable("USD") ? TOPUP_METHOD.USD : "", BDT: methodAvailable("BDT") ? TOPUP_METHOD.BDT : "" },
      transactions: transactions.map(publicTransaction),
    });
  } catch (error) { next(error); }
}

// Starts a top-up: the customer pays `amount` in `currency` and the USD value is added after payment.
export async function createTopup(req, res, next) {
  try {
    const currency = String(req.body?.currency || "").toUpperCase();
    if (!Object.hasOwn(TOPUP_METHOD, currency)) throw new WalletError("Choose USD or BDT.");
    const amount = Number(req.body?.amount);
    const min = config.wallet.minTopup[currency];
    const max = config.wallet.maxTopup[currency];
    const decimals = currency === "BDT" ? 0 : 2;
    if (!Number.isFinite(amount) || Math.round(amount * 10 ** decimals) !== amount * 10 ** decimals) throw new WalletError(currency === "BDT" ? "Enter a whole taka amount." : "Enter an amount with at most 2 decimals.");
    if (amount < min) throw new WalletError(`The minimum recharge is ${currency === "BDT" ? `৳${min}` : `$${min}`}.`);
    if (amount > max) throw new WalletError(`The maximum recharge is ${currency === "BDT" ? `৳${max}` : `$${max}`} at a time.`);
    if (!methodAvailable(currency)) throw new WalletError(`Recharging in ${currency} is not available right now.`, 503);
    // Old top-ups that never got paid do not block anything, but limit how many can be open at once.
    const open = await WalletTransaction.countDocuments({ userId: req.user.id, type: "topup", status: "pending", createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } });
    if (open >= 5) throw new WalletError("You have several unfinished recharges. Finish or wait for them before starting another.", 429);

    const bdtPerUsd = config.wallet.bdtPerUsd;
    const transaction = await WalletTransaction.create({
      userId: req.user.id, type: "topup", status: "pending", method: TOPUP_METHOD[currency],
      amountCents: topupCreditCents(amount, currency, bdtPerUsd), paidAmount: amount, paidCurrency: currency, bdtPerUsd,
    });
    const url = currency === "BDT" ? await startZinipayTopup(transaction, req.user) : await startCryptomusTopup(transaction);
    res.status(201).json({ url, topupId: String(transaction._id) });
  } catch (error) { walletErrorResponse(res, error, next); }
}

// Called by the wallet page when the customer returns from the payment page, in case the webhook is late.
export async function confirmTopup(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid recharge id." });
    let transaction = await WalletTransaction.findOne({ _id: req.params.id, userId: req.user.id, type: "topup" });
    if (!transaction) return res.status(404).json({ error: "Recharge not found." });
    if (transaction.status === "pending") {
      try {
        if (transaction.method === "zinipay" && transaction.zinipayValId) await settleZinipayTopup(transaction);
        else if (transaction.method === "cryptomus" && transaction.cryptomusOrderId) await settleCryptomusTopup(transaction);
      } catch (error) { console.error(`Top-up check failed for ${transaction._id}:`, error.message); }
      transaction = await WalletTransaction.findById(transaction._id);
    }
    res.json({ transaction: publicTransaction(transaction), balanceUsd: fromCents(await walletBalanceCents(req.user.id)) });
  } catch (error) { next(error); }
}

// Checkout "Pay from wallet": charges the balance, then delivers the orders. Any order that cannot be
// delivered is refunded to the wallet straight away.
export async function payWithWallet(req, res, next) {
  try {
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : (req.body?.orderId ? [req.body.orderId] : []);
    if (!orderIds.length || orderIds.length > 100 || orderIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ error: "Valid order ids are required." });
    const ids = [...new Set(orderIds.map(String))];
    const { transactionId, orders } = await chargeWalletForOrders(req.user.id, ids, PENDING_ORDER_EXPIRY_MS);
    const refunded = [];
    for (const order of orders) {
      try { await fulfillPaidOrder(String(order._id), { method: "wallet", reference: transactionId }); }
      catch (error) {
        console.error(`Wallet payment ${transactionId}: order ${order._id} could not be delivered, refunding:`, error.message);
        await refundToWallet(req.user.id, toCents(order.amount), [order._id], `Refund: order #${String(order._id).slice(-7)} could not be delivered`);
        // The customer has the money back, so the order must not stay "processing".
        await Order.updateOne({ _id: order._id, status: { $in: ["pending", "processing"] }, walletTransactionId: transactionId }, { $set: { status: "cancelled", paymentReference: `${transactionId} (refunded to wallet)` } });
        refunded.push(String(order._id));
      }
    }
    console.log(`Wallet payment ${transactionId}: ${orders.length - refunded.length} order(s) paid for user ${req.user.id}${refunded.length ? `, ${refunded.length} refunded` : ""}.`);
    res.json({ url: `${config.frontendOrigin}/profile?payment=wallet&orderIds=${encodeURIComponent(ids.join(","))}`, refunded });
  } catch (error) { walletErrorResponse(res, error, next); }
}
