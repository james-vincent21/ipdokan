"use client";

import { Fragment, useEffect, useState } from "react";
import { useErrorToast } from "@/lib/toast";

const emptyCoupon = { code: "", type: "percent", percent: "10", amountUsd: "", amountBdt: "", maxUses: "", expiresAt: "", onePerUser: true, allProducts: true, productIds: [] };
const STATUS_LABEL = { pending: "Awaiting payment", processing: "Processing", paid: "Paid", cancelled: "Cancelled" };

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

// Products a coupon works on, as a short line for the coupon list.
function productsLine(coupon, products) {
  if (!coupon.productIds?.length) return "All products";
  const names = coupon.productIds.map((id) => products.find((product) => String(product._id) === id)?.name || "Deleted product");
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3} more` : names.join(", ");
}

// Every order that used a coupon: the customer, what they bought, the discount and whether they paid.
function CouponCustomers({ api, coupon }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/admin/coupons/${coupon.id}/orders`).then((result) => { if (active) setOrders(result.orders); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api, coupon.id]);
  if (error) return <p className="admin-image-error">{error}</p>;
  if (!orders) return <p className="admin-loading">Loading customers…</p>;
  if (!orders.length) return <p className="admin-coupon-hint">Nobody has used this coupon yet.</p>;
  const paid = orders.filter((order) => order.status === "paid");
  return <div className="admin-coupon-customers">
    <p className="admin-coupon-hint">{paid.length} paid order{paid.length === 1 ? "" : "s"} from {new Set(paid.map((order) => order.userId)).size} customer{new Set(paid.map((order) => order.userId)).size === 1 ? "" : "s"}{orders.length > paid.length ? ` · ${orders.length - paid.length} unpaid or cancelled` : ""}</p>
    <div className="admin-table-scroll"><table className="admin-table admin-coupon-table">
      <thead><tr><th>Customer</th><th>Product</th><th>Discount</th><th>Paid</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>{orders.map((order) => <tr key={order.id} className={order.status === "paid" ? "" : "is-muted"}>
        <td>{order.userName || "Customer"}<small>{String(order.userId || "").startsWith("telegram:") ? "Telegram" : order.userEmail}</small></td>
        <td>{order.productName}{order.variantName ? <small>{order.variantName}{order.quantity > 1 ? ` · Qty ${order.quantity}` : ""}</small> : order.quantity > 1 ? <small>Qty {order.quantity}</small> : null}</td>
        <td className="admin-coupon-discount">−{money(order.discount, order.currency)}</td>
        <td>{money(order.amount, order.currency)}<small>{order.invoiceId}</small></td>
        <td><span className={`order-status order-status-${order.status}`}>{STATUS_LABEL[order.status] || order.status}</span></td>
        <td>{new Date(order.paidAt || order.createdAt).toLocaleString()}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

// Admin: discount coupons for every product or chosen products. Customers enter the code at checkout.
export function AdminCoupons({ api, products = [] }) {
  const [openId, setOpenId] = useState("");
  const [productSearch, setProductSearch] = useState("");
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
      if (!form.allProducts && !form.productIds.length) throw new Error("Choose at least one product, or pick \"All products\".");
      const { allProducts, ...fields } = form;
      const body = { ...fields, productIds: allProducts ? [] : fields.productIds, expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : "" };
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
      <p className="admin-coupon-intro">Coupons work on every product or only on the products you choose. At checkout the customer can enter the code, and the discount is taken off the product price before the service fee is added.</p>
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
        <fieldset className="admin-coupon-products">
          <legend>Works on</legend>
          <div className="admin-coupon-scope">
            <label className="admin-checkbox"><input type="radio" name="coupon-scope" checked={form.allProducts} onChange={() => setForm((current) => ({ ...current, allProducts: true }))} />All products</label>
            <label className="admin-checkbox"><input type="radio" name="coupon-scope" checked={!form.allProducts} onChange={() => setForm((current) => ({ ...current, allProducts: false }))} />Only selected products{!form.allProducts && form.productIds.length ? ` (${form.productIds.length})` : ""}</label>
          </div>
          {!form.allProducts && <>
            <input className="admin-coupon-product-search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products…" />
            <div className="admin-coupon-product-list">{products.filter((product) => !productSearch.trim() || `${product.name} ${product.codeNumber || ""}`.toLowerCase().includes(productSearch.trim().toLowerCase())).map((product) => {
              const id = String(product._id);
              const checked = form.productIds.includes(id);
              return <label className="admin-checkbox" key={id}><input type="checkbox" checked={checked} onChange={() => setForm((current) => ({ ...current, productIds: checked ? current.productIds.filter((item) => item !== id) : [...current.productIds, id] }))} />{product.name}{product.active === false ? " (hidden)" : ""}</label>;
            })}{!products.length && <p className="admin-coupon-hint">No products yet.</p>}</div>
          </>}
        </fieldset>
        {form.type === "fixed" && <p className="admin-coupon-hint">Fill in the currencies you want it to work in. A fixed coupon covers the whole cart once, and an order always keeps at least 1% of its price.</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Creating…" : "Create coupon"}</button>
      </form>
    </section>
    <section className="admin-card">
      <h2>Coupons <small>({coupons?.length || 0})</small></h2>
      {!coupons ? <p className="admin-loading">Loading coupons…</p> : coupons.length ? <div className="admin-product-list">{coupons.map((coupon) => {
        const [state, stateClass] = couponState(coupon);
        return <Fragment key={coupon.id}><article className="admin-product-row admin-coupon-row">
          <div className="admin-product-info">
            <strong><code className="admin-coupon-code">{coupon.code}</code> {couponValue(coupon)} <span className={`user-status${stateClass}`}>{state}</span></strong>
            <span>Used {coupon.uses}{coupon.maxUses > 0 ? ` / ${coupon.maxUses}` : ""} time{coupon.uses === 1 ? "" : "s"} ({coupon.paidUses} paid){coupon.onePerUser ? " · once per customer" : ""}{coupon.expiresAt ? ` · expires ${new Date(coupon.expiresAt).toLocaleDateString()}` : ""}</span>
            <span className="admin-coupon-scope-line">Works on: {productsLine(coupon, products)}</span>
            {(coupon.discountUsd > 0 || coupon.discountBdt > 0) && <small>Discount given on paid orders: {[coupon.discountUsd > 0 && money(coupon.discountUsd, "USD"), coupon.discountBdt > 0 && money(coupon.discountBdt, "BDT")].filter(Boolean).join(" + ")}</small>}
          </div>
          <button type="button" className="admin-secondary" aria-expanded={openId === coupon.id} onClick={() => setOpenId((current) => current === coupon.id ? "" : coupon.id)}>{openId === coupon.id ? "Hide customers" : `Customers (${coupon.paidUses} paid)`}</button>
          <button type="button" className="admin-secondary" onClick={() => toggle(coupon)}>{coupon.active ? "Turn off" : "Turn on"}</button>
          <button type="button" className="admin-delete" onClick={() => remove(coupon)}>Delete</button>
        </article>{openId === coupon.id && <CouponCustomers api={api} coupon={coupon} />}</Fragment>;
      })}</div> : <p className="admin-loading">No coupons yet. Create one above.</p>}
    </section>
  </>;
}
