"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrencyPreference } from "@/lib/currency-preference";
import { DEFAULT_SERVICE_FEE_PERCENT, withServiceFee } from "@/lib/service-fee";
import { Icon } from "@/components/ui/icons";

// Proxy store: type → plan → country → area → provider → buy.
// Data comes from /api/proxies (selling prices only; a price of 0 means "contact admin").
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const cartKey = "ipdokan-cart-v1";
const contactUrl = "https://t.me/IpDokan";
const PLANS_SHOWN = 6;

// Same icons as the matching nav categories.
const typeIcons = {
  datacenter: <Icon name="shield" />,
  isp: <Icon name="wifi" />,
  "premium-isp": <Icon name="star" />,
  "static-residential": <Icon name="home" />,
};
const typeTaglines = {
  datacenter: "Fast, low-cost dedicated IPs",
  isp: "Static IPs from real ISPs",
  "premium-isp": "Premium residential ISP IPs",
  "static-residential": "Native home IPs that never change",
};

function formatPrice(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}
const flag = (code) => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0))) : "🌐";
const planTitle = (plan, type) => `${plan.ips} × ${type.label} ${plan.ips === 1 ? "Proxy" : "Proxies"}`;

export function ProxyStore() {
  const [types, setTypes] = useState([]);
  const [maxQuantity, setMaxQuantity] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [typeSlug, setTypeSlug] = useState("");
  const [planId, setPlanId] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [cityKey, setCityKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [notice, setNotice] = useState("");
  const [otherProducts, setOtherProducts] = useState([]);
  const [currency, setCurrency] = useCurrencyPreference();
  const [serviceFeePercent, setServiceFeePercent] = useState(DEFAULT_SERVICE_FEE_PERCENT);
  const locationRef = useRef(null);
  const summaryRef = useRef(null);
  const plansRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("type") || "";
    fetch(`${apiUrl}/api/proxies`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load proxies.");
      const list = result.types || [];
      setTypes(list);
      setMaxQuantity(result.maxQuantity || 10);
      if (Number.isFinite(result.serviceFeePercent)) setServiceFeePercent(result.serviceFeePercent);
      setTypeSlug(list.some((type) => type.slug === requested) ? requested : list[0]?.slug || "");
      setLoadError("");
    }).catch(() => setLoadError("Could not load proxies. Please check your connection and try again."))
      .finally(() => setLoading(false));
    // Manually stocked products are listed under the matching proxy type so nothing is hidden.
    fetch(`${apiUrl}/api/products`, { cache: "no-store" }).then((response) => response.json())
      .then((result) => setOtherProducts((result.products || []).filter((product) => !product.instantDelivery)))
      .catch(() => setOtherProducts([]));
  }, []);

  const type = types.find((item) => item.slug === typeSlug) || null;
  const plan = type?.plans.find((item) => item.id === planId) || null;
  const country = type?.countries.find((item) => item.code === countryCode) || null;
  const city = country?.cities.find((item) => item.key === cityKey) || null;
  const provider = city?.providers.find((item) => item.locationId === locationId) || null;
  const unitPrice = plan ? (currency === "BDT" ? plan.priceBdt : plan.priceUsd) : 0;
  const ipsNeeded = (plan?.ips || 1) * quantity;
  const charge = withServiceFee(unitPrice * quantity, serviceFeePercent);
  const relatedProducts = type ? otherProducts.filter((product) => product.category === type.category) : [];
  const visiblePlans = (showAllPlans ? type?.plans : type?.plans.slice(0, PLANS_SHOWN)) || [];

  function chooseType(slug) {
    setTypeSlug(slug); setPlanId(""); setCountryCode(""); setCityKey(""); setLocationId(""); setQuantity(1); setShowAllPlans(false); setNotice("");
    const url = new URL(window.location.href);
    url.searchParams.set("type", slug);
    window.history.replaceState(null, "", url);
    // Take the customer down to the plans of the type they picked (phones included).
    window.setTimeout(() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function choosePlan(id) {
    setPlanId(id); setQuantity(1); setNotice("");
    // Keep the chosen location if it still has enough IPs for the new plan.
    const nextPlan = type.plans.find((item) => item.id === id);
    if (provider && provider.stock < nextPlan.ips) setLocationId("");
    window.setTimeout(() => locationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function chooseCountry(code) {
    setCountryCode(code); setNotice("");
    const nextCountry = type.countries.find((item) => item.code === code);
    if (nextCountry?.cities.length === 1) chooseCity(nextCountry.cities[0]);
    else { setCityKey(""); setLocationId(""); }
  }
  function chooseCity(nextCity) {
    setCityKey(nextCity.key); setNotice("");
    const usable = nextCity.providers.filter((item) => item.stock >= (plan?.ips || 1));
    setLocationId(usable.length === 1 ? usable[0].locationId : "");
  }
  function chooseProvider(id) {
    setLocationId(id); setNotice("");
    window.setTimeout(() => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function addToCart(goToCheckout) {
    if (!plan || !provider) return setNotice("Choose a plan, a location and a provider first.");
    if (!(unitPrice > 0)) return setNotice("The price for this plan is not set yet. Please contact admin.");
    if (provider.stock < ipsNeeded) return setNotice(`Only ${provider.stock} IP(s) are left here. Lower the quantity or pick another provider.`);
    const line = { productId: type.productId, variantId: plan.id, locationId: provider.locationId };
    let cart = [];
    try { cart = JSON.parse(window.localStorage.getItem(cartKey) || "[]"); } catch { cart = []; }
    if (!Array.isArray(cart)) cart = [];
    const same = (item) => item.productId === line.productId && (item.variantId || "") === line.variantId && (item.locationId || "") === line.locationId;
    const existing = cart.find(same);
    const nextQuantity = (existing?.quantity || 0) + quantity;
    if (nextQuantity > maxQuantity) return setNotice(`You can buy up to ${maxQuantity} of this plan in one order.`);
    const locationLabel = `${country.name} · ${city.name}${city.state ? `, ${city.state}` : ""} · ${provider.isp}`;
    const nextCart = existing
      ? cart.map((item) => same(item) ? { ...item, quantity: nextQuantity } : item)
      : [...cart, { ...line, variantName: `${plan.name} · ${locationLabel}`, name: type.name, codeNumber: type.codeNumber || "", imageUrl: "", price: unitPrice, currency, available: maxQuantity, quantity }];
    try { window.localStorage.setItem(cartKey, JSON.stringify(nextCart)); }
    catch { return setNotice("Your browser blocked the cart. Allow site storage and try again."); }
    if (goToCheckout) { router.push("/checkout"); return; }
    setNotice(`${planTitle(plan, type)} (${locationLabel}) added to your cart.`);
  }

  if (loading) return <main className="proxy-store"><p className="proxy-store-state">Loading proxies…</p></main>;
  if (loadError) return <main className="proxy-store"><p className="proxy-store-state" role="alert">{loadError}</p></main>;
  if (!type) return <main className="proxy-store"><p className="proxy-store-state">No proxies are available right now. Please check back soon.</p></main>;

  return <main className="proxy-store">
    <header className="proxy-store-heading">
      <span className="auth-kicker">IP DOKAN PROXIES</span>
      <h1>Choose your proxy type</h1>
      <p>Pick a type, choose a plan, then select the location and provider you want. Proxies are set up automatically after payment and arrive within 3–5 minutes.</p>
    </header>

    <div className="proxy-type-grid" role="tablist" aria-label="Proxy type">
      {types.map((item) => <button key={item.slug} type="button" role="tab" aria-selected={item.slug === typeSlug} className={`proxy-type-card${item.slug === typeSlug ? " is-selected" : ""}`} onClick={() => chooseType(item.slug)}>
        <span className="proxy-type-icon">{typeIcons[item.slug]}</span>
        <strong>{item.label}</strong>
        <small>{typeTaglines[item.slug]}</small>
      </button>)}
    </div>

    <section ref={plansRef} className="proxy-plan-layout" aria-label={`${type.label} plans`}>
      <aside className="proxy-type-details">
        <span className="proxy-type-icon">{typeIcons[type.slug]}</span>
        <h2>{type.label} details</h2>
        <ul className="proxy-feature-list">{type.information.map((line) => <li key={line}>{line}</li>)}</ul>
        {type.isps.length > 0 && <>
          <h3>Available providers</h3>
          <div className="proxy-chip-row">{type.isps.map((isp) => <span className="proxy-chip" key={isp}>{isp}</span>)}</div>
        </>}
        <div className="proxy-currency-toggle" role="group" aria-label="Currency">{["USD", "BDT"].map((item) => <button key={item} type="button" className={currency === item ? "is-selected" : ""} aria-pressed={currency === item} onClick={() => setCurrency(item)}>{item}</button>)}</div>
      </aside>

      <div className="proxy-plan-area">
        <div className="proxy-plan-grid">
          {visiblePlans.map((item) => {
            const price = currency === "BDT" ? item.priceBdt : item.priceUsd;
            const selected = item.id === planId;
            return <article key={item.id} className={`proxy-plan-card${selected ? " is-selected" : ""}`}>
              <h3>{planTitle(item, type)}</h3>
              <p className="proxy-plan-price">{price > 0 ? <>{formatPrice(price, currency)} <small>/ month</small></> : <span className="proxy-plan-contact">Contact admin for price</span>}</p>
              {price > 0 && item.ips > 1 && <p className="proxy-plan-per-ip">{formatPrice(price / item.ips, currency)} per IP</p>}
              <ul>
                <li>{item.ips} dedicated {item.ips === 1 ? "IP" : "IPs"}</li>
                <li>Ready in 3–5 minutes</li>
                <li>Unlimited bandwidth</li>
                <li>HTTP/HTTPS &amp; SOCKS5</li>
              </ul>
              <button type="button" className={selected ? "auth-submit" : "admin-secondary"} onClick={() => choosePlan(item.id)}>{selected ? "Selected" : "Select plan"}</button>
            </article>;
          })}
        </div>
        {type.plans.length > PLANS_SHOWN && <button type="button" className="proxy-show-more" onClick={() => setShowAllPlans((value) => !value)}>{showAllPlans ? "Show fewer plans" : `Show all ${type.plans.length} plans`}</button>}
      </div>
    </section>

    <section ref={locationRef} className={`proxy-location-section${plan ? "" : " is-disabled"}`} aria-labelledby="proxy-location-title">
      <h2 id="proxy-location-title">{plan ? <>Choose location for <span>{planTitle(plan, type)}</span></> : "Choose a plan to see available locations"}</h2>
      {plan && (type.locationsError ? <p className="proxy-store-state">Locations could not be loaded right now. Please refresh in a moment.</p> : <>
        <h3 className="proxy-step-label">1. Country</h3>
        <div className="proxy-country-row">{type.countries.map((item) => <button key={item.code} type="button" className={`proxy-country${item.code === countryCode ? " is-selected" : ""}`} onClick={() => chooseCountry(item.code)}>
          <span aria-hidden="true">{flag(item.code)}</span><strong>{item.name}</strong><small>{item.cities.length} {item.cities.length === 1 ? "area" : "areas"}</small>
        </button>)}</div>

        {country && <>
          <h3 className="proxy-step-label">2. Area and provider in {country.name}</h3>
          <div className="proxy-city-grid">{country.cities.map((item) => {
            const enough = item.providers.some((entry) => entry.stock >= plan.ips);
            return <article key={item.key} className={`proxy-city${item.key === cityKey ? " is-selected" : ""}${enough ? "" : " is-unavailable"}`}>
              <button type="button" className="proxy-city-head" disabled={!enough} onClick={() => chooseCity(item)}>
                <strong>{item.name}{item.state ? <small>, {item.state}</small> : null}</strong>
                <span className={enough ? "catalog-stock" : "catalog-stock is-empty"}>{enough ? `${item.stock} IPs available` : "Not enough IPs"}</span>
              </button>
              <div className="proxy-provider-row" aria-label={`Providers in ${item.name}`}>{item.providers.map((entry) => {
                const usable = entry.stock >= plan.ips;
                return <button key={entry.locationId} type="button" disabled={!usable} className={`proxy-provider${entry.locationId === locationId ? " is-selected" : ""}`} onClick={() => { setCityKey(item.key); chooseProvider(entry.locationId); }}>
                  {entry.isp}<small>{usable ? `${entry.stock} IPs` : "sold out"}</small>
                </button>;
              })}</div>
            </article>;
          })}</div>
        </>}
      </>)}
    </section>

    {plan && <section ref={summaryRef} className="proxy-summary" aria-label="Order summary">
      <div className="proxy-summary-info">
        <strong>{planTitle(plan, type)} · 1 month</strong>
        <span>{provider ? `${flag(country.code)} ${country.name} · ${city.name}${city.state ? `, ${city.state}` : ""} · ${provider.isp}` : "Choose a country, area and provider above"}</span>
      </div>
      {unitPrice > 0 ? <>
        <div className="product-quantity-control"><span>Quantity</span><div>
          <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
          <output>{quantity}</output>
          <button type="button" aria-label="Increase quantity" disabled={quantity >= maxQuantity || (provider && provider.stock < (plan.ips * (quantity + 1)))} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}>+</button>
        </div></div>
        <div className="product-detail-charges"><p><span>Price</span><span>{formatPrice(charge.subtotal, currency)}</span></p><p><span>Service &amp; additional fee ({serviceFeePercent}%)</span><span>{formatPrice(charge.serviceFee, currency)}</span></p></div>
        <p className="proxy-summary-total">Total <strong>{formatPrice(charge.total, currency)}</strong><small>{ipsNeeded} {ipsNeeded === 1 ? "IP" : "IPs"} · {formatPrice(charge.total / ipsNeeded, currency)} per IP incl. fee</small></p>
        <div className="proxy-summary-actions">
          <button type="button" className="admin-secondary" disabled={!provider} onClick={() => addToCart(false)}>Add to cart</button>
          <button type="button" className="auth-submit" disabled={!provider} onClick={() => addToCart(true)}>Buy now</button>
        </div>
      </> : <div className="proxy-summary-actions">
        <a className="auth-submit proxy-contact-button" href={contactUrl} target="_blank" rel="noreferrer">Contact admin</a>
        <small>The price for this plan is not set yet.</small>
      </div>}
      {notice && <p className="proxy-summary-notice" role="status">{notice}</p>}
    </section>}

    {relatedProducts.length > 0 && <section className="proxy-related" aria-labelledby="proxy-related-title">
      <h2 id="proxy-related-title">More in {type.category}</h2>
      <div className="proxy-related-grid">{relatedProducts.map((product) => {
        const prices = (product.variants?.length ? product.variants.map((variant) => currency === "BDT" ? variant.priceBdt : (variant.priceUsd ?? variant.price)) : [currency === "BDT" ? product.priceBdt : (product.priceUsd ?? product.price)]).map(Number).filter((value) => value > 0);
        return <a className="proxy-related-card" href={`/product/${encodeURIComponent(product.id)}`} key={product.id}>
          <span className="proxy-related-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.name.charAt(0).toUpperCase()}</span>
          <span><strong>{product.name}</strong><small>{prices.length ? `From ${formatPrice(Math.min(...prices), currency)}` : "View details"} · {product.available ? `${product.available} in stock` : "Out of stock"}</small></span>
        </a>;
      })}</div>
    </section>}
  </main>;
}
