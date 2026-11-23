"use client";

import { useState } from "react";

// Admin-only UI for products resold from the MyProxyApi reseller API.
export const supplierCategories = [
  ["datacenter", "Datacenter", "Private Proxy"],
  ["isp", "ISP", "Monthly ISP Proxy"],
  ["premium-isp", "Premium ISP", "Monthly ISP Proxy"],
  ["static-residential", "Static Residential", "Residential Static Proxy"],
];
export const supplierPeriods = [["1d", "1 day"], ["1w", "1 week"], ["1", "1 month"], ["3", "3 months"], ["6", "6 months"], ["12", "12 months"]];
export const emptySupplierVariant = { name: "", priceUsd: "", priceBdt: "", planId: "", period: "1", locations: "", protocol: "http", costUsd: null, planName: "" };

// The supplier returns [{ proxy_plans: [{ id, name, price, ips_included }],
//   isp: [{ name, locations: { US: { name, cities: [{ id, name, state, ips_available }] } } }] }].
// A plan's "locations" value is a city id; every plan in a category shares the same cities.
function normalizePlans(data) {
  const categories = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return categories.flatMap((category) => {
    const locations = (category.isp || []).flatMap((isp) => Object.values(isp.locations || {}).flatMap((country) => (country.cities || []).map((city) => ({
      id: String(city.id),
      name: `${country.name} · ${city.name}${city.state && city.state !== city.name ? `, ${city.state}` : ""}${(category.isp || []).length > 1 ? ` · ${isp.name}` : ""}`,
      stock: city.ips_available,
    })))).filter((location) => location.id).sort((a, b) => a.name.localeCompare(b.name));
    return (category.proxy_plans || []).map((plan) => ({ raw: plan, id: plan.id, name: String(plan.name || "Plan"), ips: Number(plan.ips_included) || undefined, price: plan.price, locations }));
  }).filter((plan) => plan.id !== undefined);
}

// One click: every MyProxyApi plan becomes a product on the site, grouped by category.
export function SupplierImport({ api, onDone }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  async function runImport() {
    setBusy(true); setError(""); setResult(null);
    try {
      const { summary } = await api("/admin/supplier/import", { method: "POST", body: JSON.stringify({}) });
      setResult(summary);
      await onDone();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }
  return <section className="admin-card admin-supplier-import">
    <h2>MyProxyApi products</h2>
    <p>Every MyProxyApi plan is loaded onto the site automatically (when the server starts and every 6 hours): Datacenter, ISP, Premium ISP and Static Residential, 1 month each. Customers choose the location on the product page. New plans have <b>no price</b>, so customers see “Contact admin” until you click <b>Edit</b> on the product and set prices. Your prices are never changed by a sync.</p>
    <div className="admin-supplier-browser-head">
      <button type="button" className="admin-secondary" disabled={busy} onClick={runImport}>{busy ? "Syncing… (about a minute)" : "Sync now"}</button>
    </div>
    {error && <p className="admin-notice is-error">{error}</p>}
    {result && <ul className="admin-supplier-summary">{result.map((item) => <li key={item.category}>{item.error ? <span className="admin-supplier-error">{item.category}: {item.error}</span> : <>{item.product}: {item.created ? "created" : "updated"}, {item.added} new plan(s), {item.total} total</>}</li>)}</ul>}
  </section>;
}

export function SupplierPlanBrowser({ api, onUsePlan }) {
  const [status, setStatus] = useState(null);
  const [category, setCategory] = useState("datacenter");
  const [plans, setPlans] = useState(null);
  const [rawPlans, setRawPlans] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(slug = category) {
    setLoading(true); setError("");
    try {
      const [statusResult, planResult] = await Promise.all([api("/admin/supplier/status"), api(`/admin/supplier/plans?category=${encodeURIComponent(slug)}`)]);
      setStatus(statusResult); setRawPlans(planResult.plans); setPlans(normalizePlans(planResult.plans));
    } catch (requestError) {
      setError(requestError.message);
      api("/admin/supplier/status").then(setStatus).catch(() => {});
    } finally { setLoading(false); }
  }

  const storeCategory = supplierCategories.find(([slug]) => slug === category)?.[2];
  return <div className="admin-supplier-browser">
    <div className="admin-supplier-browser-head">
      <label>Supplier category<select value={category} onChange={(event) => { setCategory(event.target.value); setPlans(null); }}>{supplierCategories.map(([slug, label, store]) => <option key={slug} value={slug}>{label} → {store}</option>)}</select></label>
      <button type="button" className="admin-secondary" onClick={() => load()} disabled={loading}>{loading ? "Loading…" : plans ? "Reload plans" : "Load plans"}</button>
    </div>
    {status && (status.configured
      ? status.error ? <p className="admin-notice is-error">Supplier: {status.error}</p> : <p className="admin-supplier-balance">Deposit balance: <b>{status.currency} {Number(status.balance).toFixed(2)}</b>{status.discount ? ` · Discount ${status.discount}` : ""}</p>
      : <p className="admin-notice is-error">MyProxyApi is not configured. Add MYPROXYAPI_USERNAME and MYPROXYAPI_SECRET to .env, then restart the API.</p>)}
    {error && <p className="admin-notice is-error">{error}</p>}
    {plans && <>
      <p className="admin-help-text">Plans are added under <b>{storeCategory}</b>. Click “Use” to add a plan, then set its display name, period, location and price.</p>
      <div className="admin-supplier-plans">{plans.map((plan) => <article key={`${plan.id}`} className="admin-supplier-plan">
        <div><strong>{plan.name}</strong><small>Plan #{plan.id}{plan.ips ? ` · ${plan.ips} IPs` : ""}{plan.price !== undefined ? ` · list price $${plan.price}/month (your discounted cost is shown by “Check cost”)` : ""}{plan.locations.length ? ` · ${plan.locations.length} location(s)` : ""}</small></div>
        <button type="button" className="admin-secondary" onClick={() => onUsePlan(plan, storeCategory, category)}>Use</button>
      </article>)}{!plans.length && <p className="admin-empty">No plans could be read from this category. Check the raw response below.</p>}</div>
      <details className="admin-supplier-raw"><summary>Raw supplier response</summary><pre>{JSON.stringify(rawPlans, null, 2)}</pre></details>
    </>}
  </div>;
}

export function SupplierVariantEditor({ api, variants, onChange, locationOptions }) {
  const [checking, setChecking] = useState(-1);
  const update = (index, patch) => onChange(variants.map((item, i) => i === index ? { ...item, ...patch } : item));

  async function checkCost(index) {
    const variant = variants[index];
    setChecking(index);
    try {
      const { price } = await api("/admin/supplier/price", { method: "POST", body: JSON.stringify({ planId: Number(variant.planId), period: variant.period }) });
      update(index, { costUsd: price.priceUsd, planName: price.planName, costError: "" });
    } catch (requestError) { update(index, { costUsd: null, costError: requestError.message }); }
    finally { setChecking(-1); }
  }

  return <fieldset className="admin-variant-editor">
    <legend>API plans (required)</legend>
    <p className="admin-help-text">Each plan is one option the customer can choose. After payment the proxies are ordered from MyProxyApi automatically and paid for from your deposit. The USD price must be at least the supplier cost. A plan with price 0 shows “Contact admin” and cannot be bought in that currency.</p>
    {variants.map((variant, index) => {
      const locations = locationOptions[String(variant.planId)] || [];
      const margin = variant.costUsd !== null && variant.costUsd !== undefined && variant.priceUsd !== "" ? Number(variant.priceUsd) - Number(variant.costUsd) : null;
      return <div className="admin-variant-row" key={variant.id || index}>
        <div className="admin-variant-plan-row admin-supplier-variant-row">
          <label>Display name<input required maxLength={80} value={variant.name} placeholder="USA · 1 Month" onChange={(event) => update(index, { name: event.target.value })} /></label>
          <label>Plan ID<input required type="number" min="1" step="1" value={variant.planId} onChange={(event) => update(index, { planId: event.target.value, costUsd: null })} /></label>
          <label>Period<select value={variant.period} onChange={(event) => update(index, { period: event.target.value, costUsd: null })}>{supplierPeriods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Location{locations.length
            ? <select value={variant.locations} onChange={(event) => update(index, { locations: event.target.value })}><option value="">Customer chooses</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.stock !== undefined ? ` (${location.stock})` : ""}</option>)}</select>
            : <input value={variant.locations} placeholder="Empty = customer chooses" onChange={(event) => update(index, { locations: event.target.value })} />}</label>
          <label>Protocol<select value={variant.protocol} onChange={(event) => update(index, { protocol: event.target.value })}><option value="http">HTTP/HTTPS</option><option value="socks5">SOCKS5</option></select></label>
        </div>
        <div className="admin-variant-plan-row">
          <label>USD price <span className="admin-help-text">0 = not set</span><input type="number" min="0" step="0.01" value={variant.priceUsd} onChange={(event) => update(index, { priceUsd: event.target.value })} /></label>
          <label>BDT price <span className="admin-help-text">0 = not set</span><input type="number" min="0" step="0.01" value={variant.priceBdt} onChange={(event) => update(index, { priceBdt: event.target.value })} /></label>
          <button type="button" className="admin-secondary" disabled={!variant.planId || checking === index} onClick={() => checkCost(index)}>{checking === index ? "Checking…" : "Check cost"}</button>
          <button type="button" className="admin-secondary admin-variant-remove" onClick={() => onChange(variants.filter((_, i) => i !== index))}>Remove</button>
        </div>
        <p className="admin-variant-available">
          {variant.costError ? <span className="admin-variant-duplicate">{variant.costError}</span>
            : variant.costUsd !== null && variant.costUsd !== undefined ? <>Supplier cost ${Number(variant.costUsd).toFixed(2)}{variant.planName ? ` · ${variant.planName}` : ""}{margin !== null && <span className={margin < 0 ? "admin-variant-duplicate" : ""}> · Profit ${margin.toFixed(2)} per unit</span>}</>
              : "Click “Check cost” to see the supplier price for this period."}
        </p>
      </div>;
    })}
    <button type="button" className="admin-secondary" onClick={() => onChange([...variants, { ...emptySupplierVariant }])}>Add plan</button>
  </fieldset>;
}

// Order-table controls for supplier orders: errors, retry, and pasting proxies by hand.
export function SupplierOrderActions({ order, api, onDone, onError }) {
  const [busy, setBusy] = useState(false);
  async function retry() {
    setBusy(true);
    try {
      let confirmNotPlaced = false;
      if (order.supplierUncertain) {
        if (!window.confirm("The last request to MyProxyApi got no answer, so the order may already exist there. Open the MyProxyApi panel and check first. Retry only if NO order was created. Retry now?")) return;
        confirmNotPlaced = true;
      }
      await api(`/admin/orders/${order._id}/supplier-retry`, { method: "POST", body: JSON.stringify({ confirmNotPlaced }) });
      await onDone("Supplier delivery retried.");
    } catch (requestError) { onError(requestError.message); }
    finally { setBusy(false); }
  }
  async function paste(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/admin/orders/${order._id}/supplier-delivery`, { method: "PATCH", body: JSON.stringify({ lines: new FormData(event.currentTarget).get("lines") }) });
      await onDone("Proxies delivered to the customer.");
    } catch (requestError) { onError(requestError.message); }
    finally { setBusy(false); }
  }
  const canRetry = order.status === "processing" || (order.status === "paid" && order.supplierDeliveryPending);
  return <div className="admin-supplier-order">
    {order.supplierError && <small className="admin-supplier-error">{order.supplierError}</small>}
    {order.supplierOrders?.length > 0 && <small>Supplier order(s): {order.supplierOrders.map((item) => item.orderId).join(", ")}</small>}
    {canRetry && <button type="button" className="admin-secondary" disabled={busy} onClick={retry}>{order.status === "processing" ? "Retry delivery" : "Check proxies again"}</button>}
    {order.status === "paid" && order.supplierDeliveryPending && <details><summary>Paste proxies by hand</summary><form onSubmit={paste}><textarea name="lines" rows={4} required placeholder="ip:port:user:pass, one per line" /><button type="submit" className="admin-secondary" disabled={busy}>Deliver</button></form>{order.supplierOrders?.some((item) => item.details) && <pre className="admin-supplier-raw">{JSON.stringify(order.supplierOrders.map((item) => item.details), null, 2)}</pre>}</details>}
  </div>;
}

// Keeps the location lists of plans picked in the browser, keyed by plan id.
export function useSupplierLocations() {
  const [locationOptions, setLocationOptions] = useState({});
  const remember = (plan) => { if (plan.locations?.length) setLocationOptions((current) => ({ ...current, [String(plan.id)]: plan.locations })); };
  return [locationOptions, remember];
}
