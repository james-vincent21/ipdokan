"use client";

import { useEffect, useState } from "react";
import { useErrorToast } from "@/lib/toast";

const emptyCoupon = { code: "", type: "percent", percent: "10", amountUsd: "", amountBdt: "", maxUses: "", expiresAt: "", onePerUser: true };

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

function couponValue(coupon) {
  if (coupon.type === "percent") return `${coupon.percent}% off`;
  return [coupon.amountUsd > 0 && money(coupon.amountUsd, "USD"), coupon.amountBdt > 0 && money(coupon.amountBdt, "BDT")].filter(Boolean).join(" / ") + " off";
}

function couponState(coupon) {
  if (!coupon.active) return ["Off", " is-banned"];
  if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) return ["Expired", " is-banned"];
  if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) return ["Used up", " is-banned"];
  return ["Active", ""];
}

// Admin: discount coupons that work on every product. Customers enter the code at checkout.
export function AdminCoupons({ api }) {
  const [coupons, setCoupons] = useState(null);
  const [form, setForm] = useState(emptyCoupon);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useErrorToast(error);

  useEffect(() => {
    let active = true;
    api("/admin/coupons").then((result) => { if (active) setCoupons(result.coupons); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value }));

  async function create(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const body = { ...form, expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : "" };
      const result = await api("/admin/coupons", { method: "POST", body: JSON.stringify(body) });
      setCoupons((current) => [result.coupon, ...(current || [])]);
      setForm(emptyCoupon);
      setNotice(`Coupon ${result.coupon.code} created. Customers can redeem it at checkout now.`);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function toggle(coupon) {
    setError(""); setNotice("");
    try {
      const result = await api(`/admin/coupons/${coupon.id}`, { method: "PATCH", body: JSON.stringify({ active: !coupon.active }) });
      setCoupons((current) => current.map((item) => item.id === coupon.id ? result.coupon : item));
    } catch (requestError) { setError(requestError.message); }
  }

  async function remove(coupon) {
    if (!window.confirm(`Delete coupon ${coupon.code}? Customers will no longer be able to redeem it. Orders that already used it keep their discount.`)) return;
    setError(""); setNotice("");
    try {
      await api(`/admin/coupons/${coupon.id}`, { method: "DELETE" });
      setCoupons((current) => current.filter((item) => item.id !== coupon.id));
    } catch (requestError) { setError(requestError.message); }
  }

  return <>
    <section className="admin-card">
      <h2>Create coupon</h2>
      <p className="admin-coupon-intro">Coupons work on every product. At checkout the customer can enter the code, and the discount is taken off the product price before the service fee is added.</p>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <form className="admin-form admin-coupon-form" onSubmit={create}>
        <label>Coupon code<input required maxLength={40} pattern="[A-Za-z0-9_\-]{3,40}" title="3–40 letters, numbers, - or _" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="e.g. EID20" autoComplete="off" spellCheck={false} /></label>
        <label>Discount type<select value={form.type} onChange={set("type")}><option value="percent">Percent off (%)</option><option value="fixed">Fixed amount off</option></select></label>
        {form.type === "percent"
          ? <label>Percent off<input type="number" required min="1" max="99" step="0.01" value={form.percent} onChange={set("percent")} /></label>
          : <><label>Amount off in USD<input type="number" min="0" step="0.01" value={form.amountUsd} onChange={set("amountUsd")} placeholder="e.g. 2" /></label>
            <label>Amount off in BDT<input type="number" min="0" step="0.01" value={form.amountBdt} onChange={set("amountBdt")} placeholder="e.g. 250" /></label></>}
        <label>Usage limit <small>(empty = unlimited)</small><input type="number" min="0" step="1" value={form.maxUses} onChange={set("maxUses")} placeholder="Unlimited" /></label>
        <label>Expires on <small>(optional)</small><input type="date" value={form.expiresAt} onChange={set("expiresAt")} /></label>
        <label className="admin-checkbox"><input type="checkbox" checked={form.onePerUser} onChange={set("onePerUser")} />Each customer can use it only once</label>
        {form.type === "fixed" && <p className="admin-coupon-hint">Fill in the currencies you want it to work in. A fixed coupon covers the whole cart once, and an order always keeps at least 1% of its price.</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Creating…" : "Create coupon"}</button>
      </form>
    </section>
    <section className="admin-card">
      <h2>Coupons <small>({coupons?.length || 0})</small></h2>
      {!coupons ? <p className="admin-loading">Loading coupons…</p> : coupons.length ? <div className="admin-product-list">{coupons.map((coupon) => {
        const [state, stateClass] = couponState(coupon);
        return <article className="admin-product-row admin-coupon-row" key={coupon.id}>
          <div className="admin-product-info">
            <strong><code className="admin-coupon-code">{coupon.code}</code> {couponValue(coupon)} <span className={`user-status${stateClass}`}>{state}</span></strong>
            <span>Used {coupon.uses}{coupon.maxUses > 0 ? ` / ${coupon.maxUses}` : ""} time{coupon.uses === 1 ? "" : "s"} ({coupon.paidUses} paid){coupon.onePerUser ? " · once per customer" : ""}{coupon.expiresAt ? ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}` : ""}</span>
            {(coupon.discountUsd > 0 || coupon.discountBdt > 0) && <small>Discount given on paid orders: {[coupon.discountUsd > 0 && money(coupon.discountUsd, "USD"), coupon.discountBdt > 0 && money(coupon.discountBdt, "BDT")].filter(Boolean).join(" + ")}</small>}
          </div>
          <button type="button" className="admin-secondary" onClick={() => toggle(coupon)}>{coupon.active ? "Turn off" : "Turn on"}</button>
          <button type="button" className="admin-delete" onClick={() => remove(coupon)}>Delete</button>
        </article>;
      })}</div> : <p className="admin-loading">No coupons yet. Create one above.</p>}
    </section>
  </>;
}
