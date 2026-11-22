import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  productName: { type: String, required: true },
  codeNumber: { type: String, required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  variantName: { type: String, default: "" },
  invoiceId: { type: String, default: "", unique: true, sparse: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  stripeCheckoutSessionId: { type: String, default: "", index: true },
  paymentIntentId: { type: String, default: "" },
  paymentMethod: { type: String, enum: ["", "stripe", "demo", "zinipay", "cryptomus"], default: "" },
  paymentReference: { type: String, default: "" },
  // ZiniPay: one val_id is shared by every order paid in the same checkout.
  zinipayValId: { type: String, default: "", index: true },
  zinipayInvoiceId: { type: String, default: "", index: true },
  zinipayTransactionId: { type: String, default: "" },
  zinipayPaymentChannel: { type: String, default: "" },
  // Cryptomus: one order_id is shared by every order paid in the same checkout.
  cryptomusOrderId: { type: String, default: "", index: true },
  cryptomusUuid: { type: String, default: "" },
  cryptomusTxid: { type: String, default: "" },
  cryptomusPayerCurrency: { type: String, default: "" },
  // Set when the customer is sent to a payment page, so the order is not expired while they pay.
  paymentStartedAt: { type: Date, default: null },
  // Crypto payments need longer (blockchain confirmations); the order is kept until this time.
  paymentHoldUntil: { type: Date, default: null },
  status: { type: String, enum: ["pending", "processing", "paid", "cancelled"], default: "pending", index: true },
  deliveredCode: { type: String, default: "" },
  deliveredCodes: { type: [String], default: [], index: true },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

export const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
