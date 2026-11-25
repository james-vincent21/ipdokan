import mongoose from "mongoose";

// One wallet per user. The balance is kept in US cents (whole numbers) so sums never drift.
const walletSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balanceCents: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

// Every change to a wallet. amountCents is positive for money in (top-up, refund) and negative for money out.
const walletTransactionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ["topup", "purchase", "refund", "credit", "debit"], required: true },
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending", index: true },
  amountCents: { type: Number, required: true },
  // Top-ups: the part of amountCents that is a bonus (e.g. 10% extra on large recharges).
  bonusCents: { type: Number, default: 0, min: 0 },
  balanceAfterCents: { type: Number, default: null },
  // Top-ups: what the customer paid at the gateway, and the BDT rate used to convert it to USD.
  method: { type: String, enum: ["zinipay", "cryptomus", "wallet", "admin"], required: true },
  paidAmount: { type: Number, default: 0 },
  paidCurrency: { type: String, enum: ["USD", "BDT"], default: "USD" },
  bdtPerUsd: { type: Number, default: 0 },
  zinipayValId: { type: String, default: undefined, unique: true, sparse: true },
  zinipayInvoiceId: { type: String, default: "" },
  zinipayTransactionId: { type: String, default: "" },
  cryptomusOrderId: { type: String, default: undefined, unique: true, sparse: true },
  cryptomusUuid: { type: String, default: "" },
  cryptomusTxid: { type: String, default: "" },
  // Purchases and refunds: the orders paid (or refunded) from the wallet.
  orderIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  note: { type: String, default: "", maxlength: 300 },
  // Credits and debits: the admin who added or took back the money by hand.
  adminEmail: { type: String, default: "" },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

walletTransactionSchema.index({ userId: 1, createdAt: -1 });

export const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);
export const WalletTransaction = mongoose.models.WalletTransaction || mongoose.model("WalletTransaction", walletTransactionSchema);
