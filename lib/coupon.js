"use client";

import { useState } from "react";
import { withServiceFee } from "@/lib/service-fee";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const roundMoney = (value) => Math.round(value * 100) / 100;

// Mirrors orderDiscount in backend/controllers/coupon.controller.js, so the checkout shows what the gateway charges.
// `lineSubtotals`: product price × quantity of each order in the checkout, in `currency`, in the order they are placed.
export function couponDiscounts(coupon, currency, lineSubtotals) {
  if (!coupon) return lineSubtotals.map(() => 0);
  let remaining = coupon.type === "fixed" ? Number(currency === "BDT" ? coupon.amountBdt : coupon.amountUsd) || 0 : 0;
  return lineSubtotals.map((value) => {
    const subtotal = roundMoney(Number(value) || 0);
    let discount = coupon.type === "percent" ? roundMoney(subtotal * coupon.percent / 100) : remaining;
    discount = Math.max(0, Math.min(discount, roundMoney(subtotal * 0.99)));
    if (coupon.type === "fixed") remaining = roundMoney(remaining - discount);
    return discount;
  });
}

// Totals for a checkout whose lines each become one order: product subtotal, coupon discount, service fee and total due.
export function checkoutCharge(lineSubtotals, coupon, currency, feePercent) {
  const discounts = couponDiscounts(coupon, currency, lineSubtotals);
  return lineSubtotals.reduce((sum, value, index) => {
    const subtotal = withServiceFee(value, feePercent).subtotal;
    const line = withServiceFee(subtotal - discounts[index], feePercent);
    return { subtotal: roundMoney(sum.subtotal + subtotal), discount: roundMoney(sum.discount + discounts[index]), serviceFee: roundMoney(sum.serviceFee + line.serviceFee), total: roundMoney(sum.total + line.total) };
  }, { subtotal: 0, discount: 0, serviceFee: 0, total: 0 });
}

export const couponWorksIn = (coupon, currency) => !coupon || coupon.type === "percent" || Number(currency === "BDT" ? coupon.amountBdt : coupon.amountUsd) > 0;

export function couponLabel(coupon, formatPrice) {
  if (coupon.type === "percent") return `${coupon.percent}% off`;
  return [coupon.amountUsd > 0 && formatPrice(coupon.amountUsd, "USD"), coupon.amountBdt > 0 && formatPrice(coupon.amountBdt, "BDT")].filter(Boolean).join(" / ") + " off";
}

export function newCheckoutId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Optional "Have a coupon?" box. `coupon` is the applied coupon or null.
export function CouponRedeem({ coupon, onChange, currency, formatPrice, disabled }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(event) {
    event.preventDefault();
    if (!code.trim()) return setError("Enter a coupon code.");
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/coupons/check`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not check this coupon.");
      onChange(result.coupon);
      setCode("");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (coupon) return <div className="coupon-box is-applied">
    <span className="coupon-applied-icon" aria-hidden="true">✓</span>
    <div><strong>{coupon.code}</strong><small>{couponLabel(coupon, formatPrice)} applied{couponWorksIn(coupon, currency) ? "" : ` · not usable when paying in ${currency}`}</small></div>
    <button type="button" disabled={disabled} onClick={() => onChange(null)}>Remove</button>
  </div>;

  if (!open) return <button type="button" className="coupon-toggle" onClick={() => setOpen(true)}>Have a coupon? <span>Redeem it</span></button>;

  return <form className="coupon-box" onSubmit={apply}>
    <label className="coupon-field"><span className="sr-only">Coupon code</span><input autoFocus maxLength={40} value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(""); }} placeholder="Enter coupon code" autoComplete="off" spellCheck={false} /></label>
    <button type="submit" className="admin-secondary" disabled={busy || disabled}>{busy ? "Checking…" : "Apply"}</button>
    {error && <p className="coupon-error" role="alert">{error}</p>}
  </form>;
}
