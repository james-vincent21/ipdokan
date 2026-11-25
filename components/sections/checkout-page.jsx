"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { Icon } from "@/components/ui/icons";
import { useCurrencyPreference } from "@/lib/currency-preference";
import { DEFAULT_SERVICE_FEE_PERCENT, sumWithServiceFee, withServiceFee } from "@/lib/service-fee";
import { onCartChange, readCart, writeCart } from "@/lib/cart-store";
import { useErrorToast } from "@/lib/toast";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Hosted payment gateways; each one charges in a single currency.
const paymentMethodInfo = {
  zinipay: { label: "Pay with ZiniPay", detail: "bKash, Nagad, Rocket, Upay & more", currency: "BDT" },
  cryptomus: { label: "Pay with Cryptomus", detail: "USDT, BTC, ETH & other crypto", currency: "USD" },
  // Paid instantly from the customer's USD wallet balance.
  wallet: { label: "Pay from wallet", detail: "Use your IP DOKAN balance", currency: "USD" },
};

function PaymentLogo({ method }) {
  if (method === "wallet") return <span className="pay-option-logo is-wallet" aria-hidden="true"><Icon name="wallet" /></span>;
  if (method === "zinipay") return <img className="pay-option-logo is-wallets" src="/zinipay-1.webp" alt="bKash, Nagad, Rocket, Upay and other wallets" />;
  return <span className="pay-option-logo is-crypto" aria-hidden="true"><i className="coin-usdt">₮</i><i className="coin-btc">₿</i><i className="coin-eth">Ξ</i></span>;
}

// Shown after "Buy now" / "Place order": the customer picks a gateway and sees the exact amount for each.
function PaymentChooser({ methods, amounts, feePercent, walletBalance, busy, onChoose, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return <div className="search-overlay pay-chooser-overlay" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="search-modal pay-chooser" role="dialog" aria-modal="true" aria-labelledby="pay-chooser-title">
      <div className="search-modal-heading">
        <div><span className="search-modal-kicker">CHECKOUT</span><h2 id="pay-chooser-title">Choose payment method</h2></div>
        <button type="button" className="search-modal-close" aria-label="Close" disabled={busy} onClick={onClose}>×</button>
      </div>
      <div className="pay-chooser-options">
        {methods.map((method) => {
          const info = paymentMethodInfo[method];
          const amount = amounts[info.currency] || 0;
          // walletBalance: a number, "signed-out", or null while it loads.
          const walletShort = method === "wallet" && (typeof walletBalance !== "number" || walletBalance + 0.0001 < amount);
          return <button type="button" key={method} className="pay-option" disabled={busy || !(amount > 0) || walletShort} onClick={() => onChoose(method)}>
            <PaymentLogo method={method} />
            <span className="pay-option-text"><strong>{info.label}</strong><small>{info.detail}</small>
              {method === "wallet" && <span className="pay-option-balance">{walletBalance === "signed-out" ? <>Sign in to use your wallet</> : typeof walletBalance !== "number" ? "Checking balance…" : <>Balance {formatPrice(walletBalance, "USD")}{walletShort && <> · not enough · <a href="/wallet" onClick={(event) => event.stopPropagation()}>Recharge</a></>}</>}</span>}
            </span>
            <span className="pay-option-amount">{amount > 0 ? formatPrice(amount, info.currency) : `Not available in ${info.currency}`}</span>
          </button>;
        })}
      </div>
      <p className="pay-chooser-note">{busy ? "Taking you to the secure payment page…" : `Amounts include the ${feePercent}% service & additional fee. You will be taken to the provider's secure page to pay. Your code is delivered as soon as the payment is confirmed.`}</p>
    </div>
  </div>;
}

function formatPrice(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

export function CheckoutPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isProductPage, setIsProductPage] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [error, setError] = useState("");
  useErrorToast(error, error.includes("Sign in") ? { href: "/sign-in", label: "Go to sign in" } : null);
  const [reviews, setReviews] = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [reviewAuthChecked, setReviewAuthChecked] = useState(false);
  const [paymentCurrency, setPaymentCurrency] = useCurrencyPreference();
  const [paymentMode, setPaymentMode] = useState("loading");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [chooser, setChooser] = useState("");
  const [serviceFeePercent, setServiceFeePercent] = useState(DEFAULT_SERVICE_FEE_PERCENT);
  const [walletBalance, setWalletBalance] = useState(null);
  const hostedMethods = paymentMethods.filter((method) => method in paymentMethodInfo);

  // The wallet balance is read each time the payment chooser opens, so a fresh recharge shows up.
  useEffect(() => {
    if (!chooser || !paymentMethods.includes("wallet")) return;
    let active = true;
    fetch(`${apiUrl}/api/wallet`, { credentials: "include", cache: "no-store" })
      .then(async (response) => { const result = await response.json().catch(() => ({})); if (active) setWalletBalance(response.status === 401 ? "signed-out" : response.ok ? result.balanceUsd : null); })
      .catch(() => { if (active) setWalletBalance(null); });
    return () => { active = false; };
  }, [chooser, paymentMethods]);

  useEffect(() => {
    const pathProductId = window.location.pathname.match(/^\/product\/([^/]+)/)?.[1] || "";
    setProductId(new URLSearchParams(window.location.search).get("product") || pathProductId);
    setIsProductPage(Boolean(pathProductId));
    setProductName(new URLSearchParams(window.location.search).get("name") || "");
    setCart(readCart());
    fetch(`${apiUrl}/api/products`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (response.ok) {
        setProducts(result.products || []);
        setError((current) => current?.startsWith("Only ") || current?.includes("out of stock") ? "" : current);
      }
    }).catch(() => setError("Could not load products. Please check your connection and try again."))
      .finally(() => setLoading(false));
    fetch(`${apiUrl}/api/payments/mode`, { cache: "no-store" }).then((response) => response.json()).then((result) => {
      setPaymentMode(result.mode || "disabled");
      const methods = Array.isArray(result.methods) ? result.methods : [result.mode || "disabled"];
      setPaymentMethods(methods);
      if (Number.isFinite(result.serviceFeePercent)) setServiceFeePercent(result.serviceFeePercent);
    }).catch(() => setPaymentMode("disabled"));
    if (new URLSearchParams(window.location.search).get("payment") === "cancelled") setError("Payment was cancelled. No money was charged.");
  }, []);


  useEffect(() => {
    if (!isProductPage) return;
    const refreshStock = () => {
      fetch(`${apiUrl}/api/products`, { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (response.ok) {
            setProducts(result.products || []);
            setError((current) => current?.startsWith("Only ") || current?.includes("out of stock") ? "" : current);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refreshStock);
    document.addEventListener("visibilitychange", refreshStock);
    return () => {
      window.removeEventListener("focus", refreshStock);
      document.removeEventListener("visibilitychange", refreshStock);
    };
  }, [isProductPage]);

  const selectedProduct = products.find((product) => product.id === productId || (productName && product.name.toLowerCase() === productName.toLowerCase()));
  const selectedVariant = selectedProduct?.variants?.length ? selectedProduct.variants.find((item) => item.id === variantId) || selectedProduct.variants[0] : null;
  const selectedAvailable = selectedVariant?.available ?? selectedProduct?.available ?? 0;
  const selectedPrice = selectedVariant?.price ?? selectedProduct?.price ?? 0;
  const selectedPriceUsd = selectedVariant?.priceUsd ?? selectedProduct?.priceUsd ?? selectedPrice;
  const selectedPriceBdt = selectedVariant?.priceBdt ?? selectedProduct?.priceBdt ?? 0;
  const selectedPaymentPrice = paymentCurrency === "BDT" ? selectedPriceBdt : selectedPriceUsd;
  // API plans whose price the admin has not set (0) cannot be bought; the buyer contacts the admin.
  const priceMissing = Boolean(selectedProduct?.instantDelivery) && !(selectedPaymentPrice > 0);
  // Proxy plans without a fixed location: the buyer picks a city that has enough IPs left.
  const needsLocation = Boolean(selectedVariant?.chooseLocation);
  const locationChoices = needsLocation ? (selectedProduct?.locationOptions || []) : [];
  const selectedLocation = locationChoices.find((location) => location.id === locationId) || null;
  const locationError = needsLocation && !selectedLocation ? "Choose a location first." : needsLocation && selectedLocation.stock < (selectedVariant.ips || 1) * Number(quantity || 1) ? `${selectedLocation.name} does not have enough IPs for this plan. Choose another location.` : "";
  // Per currency: product subtotal, the service fee, and the total the customer pays.
  const totals = useMemo(() => Object.fromEntries([...new Set(cart.map((item) => item.currency))].map((currency) => [currency,
    sumWithServiceFee(cart.filter((item) => item.currency === currency).map((item) => item.price * item.quantity), serviceFeePercent)])), [cart, serviceFeePercent]);
  const productCharge = withServiceFee(selectedPaymentPrice * Number(quantity || 0), serviceFeePercent);

  // API proxies are bought on the proxy store page (same interface as the nav), so old links redirect there.
  useEffect(() => {
    if (isProductPage && selectedProduct?.proxyType) window.location.replace(`/proxies?type=${encodeURIComponent(selectedProduct.proxyType)}`);
  }, [isProductPage, selectedProduct?.proxyType]);

  useEffect(() => {
    if (isProductPage) {
      document.title = selectedProduct?.name
        ? `${selectedProduct.name} | IP DOKAN`
        : "Product details | IP DOKAN";
    } else {
      document.title = "Checkout | IP DOKAN";
    }
  }, [isProductPage, selectedProduct]);

  useEffect(() => {
    if (!isProductPage || !selectedProduct?.id) return;
    setReviewAuthChecked(false);
    setCanReview(false);
    fetch(`${apiUrl}/api/products/${selectedProduct.id}/reviews`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok) setReviews(result.reviews || []);
      })
      .catch(() => setReviews([]));
    fetch(`${apiUrl}/api/profile`, { credentials: "include" })
      .then((response) => { setCanReview(response.ok); setReviewAuthChecked(true); })
      .catch(() => { setCanReview(false); setReviewAuthChecked(true); });
  }, [isProductPage, selectedProduct?.id]);

  async function submitReview(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/products/${selectedProduct.id}/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your review.");
      setReviewComment("");
      setMessage("Your review was submitted.");
      setReviews((current) => [result.review, ...current]);
      setProducts((current) => current.map((product) => product.id === selectedProduct.id ? { ...product, rating: result.rating, reviewCount: result.reviewCount } : product));
    } catch (requestError) { setError(requestError.message); }
  }

  async function toggleReviewLike(review) {
    setError("");
    if (!canReview) { setError("Sign in to like comments."); return; }
    try {
      const response = await fetch(`${apiUrl}/api/products/${selectedProduct.id}/reviews/${review.id}/like`, { method: "POST", credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update the like.");
      setReviews((current) => current.map((item) => item.id === review.id ? { ...item, likeCount: result.likeCount, userLiked: result.userLiked } : item));
    } catch (requestError) { setError(requestError.message); }
  }

  const sameLine = (a, b) => a.productId === b.productId && (a.variantId || "") === (b.variantId || "") && (a.locationId || "") === (b.locationId || "");

  function persistCart(nextCart) {
    setCart(nextCart);
    try { writeCart(nextCart); } catch { /* storage blocked: the cart lasts for this page only */ }
  }

  // Shows changes made in another tab or on another device (signed-in customers) right away.
  useEffect(() => onCartChange((items) => setCart(items)), []);

  useEffect(() => {
    if (!products.length || !cart.length) return;
    const nextCart = cart.map((item) => {
      const catalogProduct = products.find((entry) => entry.id === item.productId);
      if (!catalogProduct) return item;
      const variant = catalogProduct.variants?.find((entry) => entry.id === item.variantId);
      const price = paymentCurrency === "BDT"
        ? (variant?.priceBdt ?? catalogProduct.priceBdt ?? 0)
        : (variant?.priceUsd ?? catalogProduct.priceUsd ?? variant?.price ?? catalogProduct.price ?? 0);
      return { ...item, currency: paymentCurrency, price };
    });
    if (JSON.stringify(nextCart) !== JSON.stringify(cart)) persistCart(nextCart);
  }, [cart, paymentCurrency, products]);

  function addToCart(event) {
    event?.preventDefault(); setError(""); setMessage("");
    const amount = Number(quantity);
    if (!selectedProduct) return setError("Choose an available product first.");
    if (selectedAvailable <= 0) return setError("This plan is currently out of stock.");
    if (!Number.isInteger(amount) || amount < 1 || amount > selectedAvailable) return setError(`Choose a quantity from 1 to ${selectedAvailable}.`);
    if (priceMissing) return setError("The price for this plan is not set yet. Please contact admin.");
    if (locationError) return setError(locationError);
    const line = { productId: selectedProduct.id, variantId: selectedVariant?.id || "", locationId: selectedLocation?.id || "" };
    const existing = cart.find((item) => sameLine(item, line));
    const nextQuantity = amount + (existing?.quantity || 0);
    if (nextQuantity > selectedAvailable) return setError(`Your cart can contain up to ${selectedAvailable} unit(s) of this plan.`);
    const nextCart = existing
      ? cart.map((item) => sameLine(item, line) ? { ...item, quantity: nextQuantity } : item)
      : [...cart, {
        ...line,
        variantName: [selectedVariant?.name, selectedLocation?.name].filter(Boolean).join(" · "),
        name: selectedProduct.name,
        codeNumber: selectedProduct.codeNumber,
        imageUrl: selectedProduct.imageUrl,
        price: selectedPaymentPrice,
        currency: paymentCurrency,
        available: selectedAvailable,
        quantity: amount,
      }];
    persistCart(nextCart);
    setMessage(`${selectedProduct.name} added to your cart.`);
  }

  function changeQuantity(item, value) {
    const amount = Number(value);
    if (!Number.isInteger(amount) || amount < 1 || amount > item.available) return;
    persistCart(cart.map((entry) => sameLine(entry, item) ? { ...entry, quantity: amount } : entry));
  }

  // Price of a cart line in a given currency, read from the live catalog.
  function linePrice(item, currency) {
    const product = products.find((entry) => entry.id === item.productId);
    const variant = product?.variants?.find((entry) => entry.id === item.variantId);
    if (!product) return item.currency === currency ? item.price : 0;
    return currency === "BDT"
      ? (variant?.priceBdt ?? product.priceBdt ?? 0)
      : (variant?.priceUsd ?? product.priceUsd ?? variant?.price ?? product.price ?? 0);
  }

  function chooserAmounts(kind) {
    if (kind === "product") {
      const amount = Number(quantity || 0);
      return { BDT: withServiceFee(selectedPriceBdt * amount, serviceFeePercent).total, USD: withServiceFee(selectedPriceUsd * amount, serviceFeePercent).total };
    }
    return Object.fromEntries(["BDT", "USD"].map((currency) => [currency, sumWithServiceFee(cart.map((item) => linePrice(item, currency) * item.quantity), serviceFeePercent).total]));
  }

  // With hosted gateways, "Buy now" / "Place order" first opens the payment method chooser.
  function startPurchase(kind) {
    setError(""); setMessage("");
    if (kind === "product") {
      const amount = Number(quantity);
      if (!selectedProduct || !Number.isInteger(amount) || amount < 1 || amount > selectedAvailable) return setError(`Choose a quantity from 1 to ${selectedAvailable}.`);
      if (priceMissing) return setError("The price for this plan is not set yet. Please contact admin.");
      if (locationError) return setError(locationError);
    }
    if (hostedMethods.length) return setChooser(kind);
    return kind === "product" ? purchaseProduct() : placeOrders();
  }

  async function startStripeCheckout(orderIds, method = "") {
    if (method in paymentMethodInfo) {
      const response = await fetch(`${apiUrl}/api/payments/${method}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not start the ${paymentMethodInfo[method].label.replace(/^Pay (with|from) /, "")} payment.`);
      window.location.assign(result.url);
      return true;
    }
    const modeResponse = await fetch(`${apiUrl}/api/payments/mode`, { cache: "no-store" });
    const modeResult = await modeResponse.json();
    if (modeResult.mode === "demo") {
      const response = await fetch(`${apiUrl}/api/payments/demo/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete the demo payment.");
      setDeliveredOrders(result.orders || []);
      setMessage("Demo payment successful. No real payment was charged. Your purchase is available in your Profile.");
      return;
    }
    if (modeResult.mode !== "stripe") throw new Error("Payment is not configured on the server yet.");
    const response = await fetch(`${apiUrl}/api/payments/stripe/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ orderIds }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not start Stripe checkout.");
    window.location.assign(result.url);
  }

  async function placeOrders(method = "") {
    setBusy(true); setError(""); setMessage("");
    const orderIds = [];
    let remainingCart = [...cart];
    const currency = paymentMethodInfo[method]?.currency;
    let redirecting = false;
    try {
      for (const item of [...cart]) {
        const response = await fetch(`${apiUrl}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId: item.productId, variantId: item.variantId || undefined, locationId: item.locationId || undefined, quantity: item.quantity, currency: currency || item.currency }) });
        const result = await response.json();
        if (response.status === 401) throw new Error("Sign in before placing your order.");
        if (!response.ok) throw new Error(result.error || `Could not place the ${item.name} order.`);
        orderIds.push(result.order.id);
        remainingCart = remainingCart.filter((entry) => !sameLine(entry, item));
        persistCart(remainingCart);
        setProducts((current) => current.map((product) => product.id === item.productId ? { ...product, available: Math.max(0, product.available - item.quantity) } : product));
      }
      redirecting = await startStripeCheckout(orderIds, method);
    } catch (requestError) { setError(requestError.message); setChooser(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { if (!redirecting) setBusy(false); }
  }

  async function purchaseProduct(method = "") {
    const amount = Number(quantity);
    if (!selectedProduct || !Number.isInteger(amount) || amount < 1 || amount > selectedAvailable) {
      setError(`Choose a quantity from 1 to ${selectedAvailable}.`);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    let redirecting = false;
    try {
      const response = await fetch(`${apiUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: selectedProduct.id, variantId: selectedVariant?.id || undefined, locationId: selectedLocation?.id || undefined, quantity: amount, currency: paymentMethodInfo[method]?.currency || paymentCurrency }),
      });
      const result = await response.json();
      if (response.status === 401) throw new Error("Sign in before purchasing.");
      if (!response.ok) throw new Error(result.error || "Could not place your order.");
      setProducts((current) => current.map((product) => product.id !== selectedProduct.id ? product : {
        ...product,
        available: Math.max(0, product.available - amount),
        variants: product.variants?.map((variant) => variant.id === selectedVariant?.id ? { ...variant, available: Math.max(0, variant.available - amount) } : variant),
      }));
      redirecting = await startStripeCheckout([result.order.id], method);
    } catch (requestError) { setError(requestError.message); setChooser(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
    finally { if (!redirecting) setBusy(false); }
  }

  return <main className="checkout-page">
    {chooser && <PaymentChooser methods={hostedMethods} amounts={chooserAmounts(chooser)} feePercent={serviceFeePercent} walletBalance={walletBalance} busy={busy} onClose={() => setChooser("")} onChoose={(method) => (chooser === "product" ? purchaseProduct(method) : placeOrders(method))} />}
    <div className="checkout-shell">
      <header className="checkout-heading"><span className="auth-kicker">IP DOKAN STORE</span><h1>{isProductPage ? "Product details" : "Checkout"}</h1><p>{isProductPage ? "Review product details, choose a plan, and add your quantity." : "Review your cart and place the order."}</p></header>
      {message && <p className="admin-notice" role="status">{message}</p>}
      {deliveredOrders.length > 0 && <section className="admin-card checkout-delivery-card" aria-label="Delivered secret codes and invoices"><h2>Payment complete — your secret code and invoice</h2>{deliveredOrders.map((order) => <article key={order.id}><strong>{order.productName}{order.variantName ? ` — ${order.variantName}` : ""}</strong>{order.deliveredCodes.map((code) => <code className="delivered-code" key={code}>{code}</code>)}<p>Invoice ID: {order.invoiceId}</p><button type="button" className="invoice-download" onClick={() => { if (!downloadInvoicePdf(order, { name: order.userName, email: order.userEmail })) setError("Allow pop-ups to download your invoice as a PDF."); }}>Download invoice PDF</button></article>)}</section>}
      {loading ? <p className="admin-loading">Loading products…</p> : isProductPage ? selectedProduct ? <><nav className="product-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span>{selectedProduct.brand && selectedProduct.brand.toLowerCase() !== selectedProduct.name.toLowerCase() ? <><a href={`/catalog?brand=${encodeURIComponent(selectedProduct.brand)}`}>{selectedProduct.brand}</a><span>/</span></> : <><a href={`/catalog?category=${encodeURIComponent(selectedProduct.category || "Other")}`}>{selectedProduct.category || "Products"}</a><span>/</span></>}<strong>{selectedProduct.name}</strong></nav><section className="product-detail-layout">
        <div className="product-detail-image">{Number(selectedProduct.discountPercent) > 0 && <span className="store-product-discount">-{selectedProduct.discountPercent}%</span>}{selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} /> : <span className="store-product-placeholder">{selectedProduct.name?.trim()?.charAt(0).toUpperCase() || "P"}</span>}</div>
        <div className="admin-card product-detail-info">
          <span className="product-detail-category">{selectedProduct.category || "Product"}</span>
          <h2>{selectedProduct.name}</h2>
          {selectedProduct.instantDelivery && <p className="instant-delivery-badge">⚡ Automatic delivery: after payment your proxy is prepared and arrives within 3–5 minutes.</p>}
          {selectedProduct.rating > 0 && <p className="product-detail-rating">★ {Number(selectedProduct.rating).toFixed(1)} {selectedProduct.reviewCount ? `(${selectedProduct.reviewCount} reviews)` : ""}</p>}
          <p className="product-detail-description">{selectedProduct.description || "Product details and plan options."}</p>
          <p className="product-detail-sku">SKU: {selectedProduct.codeNumber}</p>
          {selectedProduct.variants?.length > 0 && <div className="product-detail-label"><span>Choose plan / variant</span><div className="product-variant-options">{selectedProduct.variants.map((variant) => <button type="button" key={variant.id} className={selectedVariant?.id === variant.id ? "is-selected" : ""} disabled={!variant.available} onClick={() => { setVariantId(variant.id); setQuantity("1"); setError(""); }}><strong>{variant.name}</strong><small>{selectedProduct.instantDelivery && !((paymentCurrency === "BDT" ? variant.priceBdt : variant.priceUsd) > 0) ? "Contact admin" : formatPrice(paymentCurrency === "BDT" ? (variant.priceBdt ?? 0) : (variant.priceUsd ?? variant.price), paymentCurrency)}</small>{variant.ips > 1 && ((paymentCurrency === "BDT" ? variant.priceBdt : variant.priceUsd) > 0) && <small className="variant-per-ip">{formatPrice((paymentCurrency === "BDT" ? variant.priceBdt : variant.priceUsd) / variant.ips, paymentCurrency)} per IP</small>}</button>)}</div></div>}
          <div className="product-detail-price-row">
            {priceMissing ? <strong className="product-detail-price">Contact admin for price</strong> : <strong className="product-detail-price">{formatPrice(selectedPaymentPrice, paymentCurrency)} <small>per unit</small></strong>}
            <div className="product-payment-currency" aria-label="Payment currency"><button type="button" className={paymentCurrency === "USD" ? "is-selected" : ""} onClick={() => setPaymentCurrency("USD")}>USD</button><button type="button" className={paymentCurrency === "BDT" ? "is-selected" : ""} onClick={() => setPaymentCurrency("BDT")}>BDT</button></div>
          </div>
          {!priceMissing && !(selectedProduct.instantDelivery && !(selectedPriceUsd > 0 && selectedPriceBdt > 0)) && <p className="product-detail-alt-price">Also available: {formatPrice(selectedPriceUsd, "USD")} / {formatPrice(selectedPriceBdt, "BDT")}</p>}
          {needsLocation && <label className="product-detail-label product-location-select"><span>Choose location</span><select value={selectedLocation?.id || ""} onChange={(event) => { setLocationId(event.target.value); setError(""); }}><option value="">Select a location…</option>{locationChoices.map((location) => <option key={location.id} value={location.id} disabled={location.stock < (selectedVariant.ips || 1)}>{location.name}{location.stock < (selectedVariant.ips || 1) ? " (not enough IPs)" : ""}</option>)}</select>{!locationChoices.length && <small>Locations could not be loaded. Refresh the page or contact support.</small>}</label>}
          <p className="product-detail-stock">{selectedAvailable > 0 ? `${selectedAvailable} available` : "Out of stock"}</p>
          <div className="product-quantity-control"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={Number(quantity) <= 1} onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))}>−</button><output>{quantity}</output><button type="button" aria-label="Increase quantity" disabled={Number(quantity) >= selectedAvailable} onClick={() => setQuantity(String(Math.min(selectedAvailable, Number(quantity) + 1)))}>+</button></div></div>
          {priceMissing ? <div className="product-detail-actions"><a className="auth-submit product-purchase-button" href="https://t.me/IpDokan" target="_blank" rel="noreferrer">Contact admin</a><p className="product-contact-note">The price for this plan is not set yet. Message admin on Telegram to order it.</p></div> : <>
          <div className="product-detail-charges"><p><span>Price</span><span>{formatPrice(productCharge.subtotal, paymentCurrency)}</span></p><p><span>Service &amp; additional fee ({serviceFeePercent}%)</span><span>{formatPrice(productCharge.serviceFee, paymentCurrency)}</span></p></div>
          <p className="product-detail-total">Total <strong>{formatPrice(productCharge.total, paymentCurrency)}</strong></p>
          {selectedVariant?.ips > 0 && productCharge.total > 0 && <p className="product-detail-per-ip">{selectedVariant.ips * Number(quantity || 0)} {selectedVariant.ips * Number(quantity || 0) === 1 ? "IP" : "IPs"} ·{formatPrice(productCharge.total / (selectedVariant.ips * Number(quantity || 1)), paymentCurrency)} per IP incl. fee</p>}
          <div className="product-detail-actions"><button className="admin-secondary" type="button" disabled={!selectedAvailable} onClick={() => addToCart()} >Add to cart</button><button className="auth-submit product-purchase-button" type="button" disabled={!selectedAvailable || busy} onClick={() => startPurchase("product")}>{busy ? "Processing…" : "Buy now"}</button></div>
          </>}
          {paymentMode === "demo" && <p className="demo-payment-note">Demo payment is on. Purchases are simulated; no real charge is made.</p>}
        </div>
      </section>
      <section className="product-reviews" aria-labelledby="product-reviews-title">
        <header className="product-reviews-heading">
          <div><span className="auth-kicker">CUSTOMER FEEDBACK</span><h2 id="product-reviews-title">Reviews</h2></div>
          <strong>{selectedProduct.rating ? `${Number(selectedProduct.rating).toFixed(1)} ★` : "No rating yet"}</strong>
        </header>
        {reviewAuthChecked && canReview && !reviews.some((review) => review.isOwn) && <form className="product-review-form" onSubmit={submitReview}>
          <label>Rating<select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}><option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Average</option><option value="2">2 - Poor</option><option value="1">1 - Very poor</option></select></label>
          <label>Comment<textarea required maxLength={1000} rows={3} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Share your experience with this product…" /></label>
          <button type="submit" className="admin-secondary">Submit review</button>
        </form>}
        {reviewAuthChecked && !canReview && <p className="product-reviews-empty">Please <a href="/sign-in">sign in</a> to comment, rate, and like.</p>}
        {reviewAuthChecked && canReview && reviews.some((review) => review.isOwn) && <p className="product-reviews-empty">You have already posted a comment for this product.</p>}
        <div className="product-review-list">
          {reviews.map((review) => <article className="product-review" key={review.id || `${review.userName}-${review.createdAt}`}>
            <div className="product-review-meta"><strong>{review.userName}</strong><span>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></div>
            <p>{review.comment}</p>
            {review.createdAt && <time>{new Date(review.createdAt).toLocaleString()}</time>}
            <button type="button" className={`product-review-like${review.userLiked ? " is-liked" : ""}`} aria-pressed={Boolean(review.userLiked)} onClick={() => toggleReviewLike(review)}>♥ {review.likeCount || 0}</button>
            {review.adminReply && <div className="product-review-admin-reply"><strong>Admin reply</strong><p>{review.adminReply.text}</p><time>{review.adminReply.repliedAt ? new Date(review.adminReply.repliedAt).toLocaleString() : ""}</time></div>}
          </article>)}
          {!reviews.length && <p className="product-reviews-empty">No customer comments yet.</p>}
        </div>
      </section>
      </> : <p className="checkout-select-hint">This product is unavailable or no longer in the catalog.</p> :       <div className="checkout-layout">
        <section className="admin-card checkout-cart-card"><div className="checkout-cart-heading"><h2>Your cart</h2><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} item(s)</span></div>
          {cart.length ? <><div className="checkout-cart-list">{cart.map((item) => <article className="checkout-cart-item" key={`${item.productId}:${item.variantId || "default"}`}>
            <div className="checkout-cart-product">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="checkout-placeholder">{item.name?.trim()?.charAt(0).toUpperCase() || "P"}</span>}<div><strong>{item.name}{item.variantName ? ` — ${item.variantName}` : ""}</strong><span>{item.codeNumber}</span><small>{formatPrice(item.price, item.currency)} each · {item.available} in stock when added</small></div></div>
            <label>Qty<input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={item.available} step="1" value={item.quantity} onChange={(event) => changeQuantity(item, event.target.value)} /></label>
            <strong className="checkout-line-total">{formatPrice(item.price * item.quantity, item.currency)}</strong>
            <button className="checkout-remove" type="button" onClick={() => persistCart(cart.filter((entry) => !(entry.productId === item.productId && (entry.variantId || "") === (item.variantId || ""))))}>Remove</button>
          </article>)}</div>
          <div className="checkout-totals">{Object.entries(totals).map(([currency, charge]) => <div className="checkout-total-group" key={currency}>
            <p><span>Subtotal ({currency})</span><span>{formatPrice(charge.subtotal, currency)}</span></p>
            <p><span>Service &amp; additional fee ({serviceFeePercent}%)</span><span>{formatPrice(charge.serviceFee, currency)}</span></p>
            <p className="checkout-total-due"><span>Total ({currency})</span><strong>{formatPrice(charge.total, currency)}</strong></p>
          </div>)}</div>
          <button className="auth-submit checkout-submit" type="button" disabled={busy} onClick={() => startPurchase("cart")}>{busy ? "Placing order…" : "Place order"}</button>
          <p className="checkout-payment-note">{paymentMode === "demo" ? "Demo mode completes the purchase without charging a real payment method." : hostedMethods.length ? `Next, choose how to pay: ${hostedMethods.map((method) => paymentMethodInfo[method].label.replace(/^Pay (with|from) /, "")).join(" or ")}. Codes are delivered as soon as the payment is confirmed.` : "Placing an order reserves inventory. Codes are delivered after Stripe confirms payment."}</p></>
          : <p className="checkout-empty">Your cart is empty. Choose a product and add a quantity to continue.</p>}
        </section>
      </div>}
      <a className="checkout-back-link" href="/catalog">← Back to products</a>
    </div>
  </main>;
}
