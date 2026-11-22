"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { useCurrencyPreference } from "@/lib/currency-preference";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const cartKey = "ipdokan-cart-v1";

// Hosted payment gateways; each one charges in a single currency.
const paymentMethodInfo = {
  zinipay: { label: "Pay with ZiniPay", detail: "bKash, Nagad & more · BDT", currency: "BDT" },
  cryptomus: { label: "Pay with Cryptomus", detail: "Crypto (USDT, BTC…) · USD", currency: "USD" },
};

function PaymentMethodPicker({ methods, value, onChange }) {
  if (!methods.length) return null;
  return <div className="product-payment-currency payment-method-picker" role="radiogroup" aria-label="Payment method">
    {methods.map((method) => <button type="button" role="radio" aria-checked={value === method} key={method} className={value === method ? "is-selected" : ""} onClick={() => onChange(method)}>
      <strong>{paymentMethodInfo[method].label}</strong><small>{paymentMethodInfo[method].detail}</small>
    </button>)}
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
  const [isProductPage, setIsProductPage] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [reviewAuthChecked, setReviewAuthChecked] = useState(false);
  const [paymentCurrency, setPaymentCurrency] = useCurrencyPreference();
  const [paymentMode, setPaymentMode] = useState("loading");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const hostedMethods = paymentMethods.filter((method) => method in paymentMethodInfo);

  useEffect(() => {
    const pathProductId = window.location.pathname.match(/^\/product\/([^/]+)/)?.[1] || "";
    setProductId(new URLSearchParams(window.location.search).get("product") || pathProductId);
    setIsProductPage(Boolean(pathProductId));
    setProductName(new URLSearchParams(window.location.search).get("name") || "");
    try {
      const savedCart = JSON.parse(window.localStorage.getItem(cartKey) || "[]");
      setCart(Array.isArray(savedCart) ? savedCart.filter((item) => item && typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0) : []);
    }
    catch { setCart([]); }
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
      setPaymentMethod(methods[0] || "");
    }).catch(() => setPaymentMode("disabled"));
    if (new URLSearchParams(window.location.search).get("payment") === "cancelled") setError("Payment was cancelled. No money was charged.");
  }, []);

  // Each hosted gateway charges in one currency: ZiniPay in BDT, Cryptomus in USD.
  useEffect(() => {
    const currency = paymentMethodInfo[paymentMethod]?.currency;
    if (currency && paymentCurrency !== currency) setPaymentCurrency(currency);
  }, [paymentMethod, paymentCurrency, setPaymentCurrency]);

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
  const totals = useMemo(() => cart.reduce((sum, item) => {
    sum[item.currency] = (sum[item.currency] || 0) + item.price * item.quantity;
    return sum;
  }, {}), [cart]);

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

  function persistCart(nextCart) {
    setCart(nextCart);
    window.localStorage.setItem(cartKey, JSON.stringify(nextCart));
  }

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
    const existing = cart.find((item) => item.productId === selectedProduct.id && (item.variantId || "") === (selectedVariant?.id || ""));
    const nextQuantity = amount + (existing?.quantity || 0);
    if (nextQuantity > selectedAvailable) return setError(`Your cart can contain up to ${selectedAvailable} unit(s) of this plan.`);
    const nextCart = existing
      ? cart.map((item) => item.productId === selectedProduct.id && (item.variantId || "") === (selectedVariant?.id || "") ? { ...item, quantity: nextQuantity } : item)
      : [...cart, {
        productId: selectedProduct.id,
        variantId: selectedVariant?.id || "",
        variantName: selectedVariant?.name || "",
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
    persistCart(cart.map((entry) => entry.productId === item.productId && (entry.variantId || "") === (item.variantId || "") ? { ...entry, quantity: amount } : entry));
  }

  async function startStripeCheckout(orderIds) {
    if (paymentMethod in paymentMethodInfo) {
      const response = await fetch(`${apiUrl}/api/payments/${paymentMethod}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Could not start the ${paymentMethodInfo[paymentMethod].label.replace("Pay with ", "")} payment.`);
      window.location.assign(result.url);
      return;
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

  async function placeOrders() {
    setBusy(true); setError(""); setMessage("");
    const orderIds = [];
    let remainingCart = [...cart];
    try {
      for (const item of [...cart]) {
        const response = await fetch(`${apiUrl}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ productId: item.productId, variantId: item.variantId || undefined, quantity: item.quantity, currency: item.currency }) });
        const result = await response.json();
        if (response.status === 401) throw new Error("Sign in before placing your order.");
        if (!response.ok) throw new Error(result.error || `Could not place the ${item.name} order.`);
        orderIds.push(result.order.id);
        remainingCart = remainingCart.filter((entry) => entry.productId !== item.productId || (entry.variantId || "") !== (item.variantId || ""));
        persistCart(remainingCart);
        setProducts((current) => current.map((product) => product.id === item.productId ? { ...product, available: Math.max(0, product.available - item.quantity) } : product));
      }
      await startStripeCheckout(orderIds);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function purchaseProduct() {
    const amount = Number(quantity);
    if (!selectedProduct || !Number.isInteger(amount) || amount < 1 || amount > selectedAvailable) {
      setError(`Choose a quantity from 1 to ${selectedAvailable}.`);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ productId: selectedProduct.id, variantId: selectedVariant?.id || undefined, quantity: amount, currency: paymentCurrency }),
      });
      const result = await response.json();
      if (response.status === 401) throw new Error("Sign in before purchasing.");
      if (!response.ok) throw new Error(result.error || "Could not place your order.");
      setProducts((current) => current.map((product) => product.id !== selectedProduct.id ? product : {
        ...product,
        available: Math.max(0, product.available - amount),
        variants: product.variants?.map((variant) => variant.id === selectedVariant?.id ? { ...variant, available: Math.max(0, variant.available - amount) } : variant),
      }));
      await startStripeCheckout([result.order.id]);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <main className="checkout-page">
    <div className="checkout-shell">
      <header className="checkout-heading"><span className="auth-kicker">IP DOKAN STORE</span><h1>{isProductPage ? "Product details" : "Checkout"}</h1><p>{isProductPage ? "Review product details, choose a plan, and add your quantity." : "Review your cart and place the order."}</p></header>
      {error && <p className="admin-notice is-error" role="alert">{error}{error.includes("Sign in") && <> <a href="/sign-in">Go to sign in</a></>}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      {deliveredOrders.length > 0 && <section className="admin-card checkout-delivery-card" aria-label="Delivered secret codes and invoices"><h2>Payment complete — your secret code and invoice</h2>{deliveredOrders.map((order) => <article key={order.id}><strong>{order.productName}{order.variantName ? ` — ${order.variantName}` : ""}</strong>{order.deliveredCodes.map((code) => <code className="delivered-code" key={code}>{code}</code>)}<p>Invoice ID: {order.invoiceId}</p><button type="button" className="invoice-download" onClick={() => { if (!downloadInvoicePdf(order, { name: order.userName, email: order.userEmail })) setError("Allow pop-ups to download your invoice as a PDF."); }}>Download invoice PDF</button></article>)}</section>}
      {loading ? <p className="admin-loading">Loading products…</p> : isProductPage ? selectedProduct ? <><nav className="product-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span>{selectedProduct.brand && selectedProduct.brand.toLowerCase() !== selectedProduct.name.toLowerCase() ? <><a href={`/catalog?brand=${encodeURIComponent(selectedProduct.brand)}`}>{selectedProduct.brand}</a><span>/</span></> : <><a href={`/catalog?category=${encodeURIComponent(selectedProduct.category || "Other")}`}>{selectedProduct.category || "Products"}</a><span>/</span></>}<strong>{selectedProduct.name}</strong></nav><section className="product-detail-layout">
        <div className="product-detail-image">{Number(selectedProduct.discountPercent) > 0 && <span className="store-product-discount">-{selectedProduct.discountPercent}%</span>}{selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} /> : <span className="store-product-placeholder">{selectedProduct.name?.trim()?.charAt(0).toUpperCase() || "P"}</span>}</div>
        <div className="admin-card product-detail-info">
          <span className="product-detail-category">{selectedProduct.category || "Product"}</span>
          <h2>{selectedProduct.name}</h2>
          {selectedProduct.rating > 0 && <p className="product-detail-rating">★ {Number(selectedProduct.rating).toFixed(1)} {selectedProduct.reviewCount ? `(${selectedProduct.reviewCount} reviews)` : ""}</p>}
          <p className="product-detail-description">{selectedProduct.description || "Product details and plan options."}</p>
          <p className="product-detail-sku">SKU: {selectedProduct.codeNumber}</p>
          <PaymentMethodPicker methods={hostedMethods} value={paymentMethod} onChange={setPaymentMethod} />
          {!hostedMethods.length && <div className="product-payment-currency" aria-label="Payment currency"><button type="button" className={paymentCurrency === "USD" ? "is-selected" : ""} onClick={() => setPaymentCurrency("USD")}>USD</button><button type="button" className={paymentCurrency === "BDT" ? "is-selected" : ""} onClick={() => setPaymentCurrency("BDT")}>BDT</button></div>}
          <strong className="product-detail-price">{formatPrice(selectedPaymentPrice, paymentCurrency)} <small>per unit</small></strong>
          <p className="product-detail-alt-price">Also available: {formatPrice(selectedPriceUsd, "USD")} / {formatPrice(selectedPriceBdt, "BDT")}</p>
          {selectedProduct.variants?.length > 0 && <div className="product-detail-label"><span>Choose plan / variant</span><div className="product-variant-options">{selectedProduct.variants.map((variant) => <button type="button" key={variant.id} className={selectedVariant?.id === variant.id ? "is-selected" : ""} disabled={!variant.available} onClick={() => { setVariantId(variant.id); setQuantity("1"); setError(""); }}><strong>{variant.name}</strong><small>{formatPrice(paymentCurrency === "BDT" ? (variant.priceBdt ?? 0) : (variant.priceUsd ?? variant.price), paymentCurrency)}</small></button>)}</div></div>}
          <p className="product-detail-stock">{selectedAvailable > 0 ? `${selectedAvailable} available` : "Out of stock"}</p>
          <div className="product-quantity-control"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={Number(quantity) <= 1} onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))}>−</button><output>{quantity}</output><button type="button" aria-label="Increase quantity" disabled={Number(quantity) >= selectedAvailable} onClick={() => setQuantity(String(Math.min(selectedAvailable, Number(quantity) + 1)))}>+</button></div></div>
          <p className="product-detail-total">Total <strong>{formatPrice(selectedPaymentPrice * Number(quantity || 0), paymentCurrency)}</strong></p>
          <div className="product-detail-actions"><button className="admin-secondary" type="button" disabled={!selectedAvailable} onClick={() => addToCart()} >Add to cart</button><button className="auth-submit product-purchase-button" type="button" disabled={!selectedAvailable || busy} onClick={purchaseProduct}>{busy ? "Processing…" : "Buy now"}</button></div>
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
          <div className="checkout-totals">{Object.entries(totals).map(([currency, total]) => <p key={currency}><span>Total ({currency})</span><strong>{formatPrice(total, currency)}</strong></p>)}</div>
          <PaymentMethodPicker methods={hostedMethods} value={paymentMethod} onChange={setPaymentMethod} />
          <button className="auth-submit checkout-submit" type="button" disabled={busy} onClick={placeOrders}>{busy ? "Placing order…" : "Place order"}</button>
          <p className="checkout-payment-note">{paymentMode === "demo" ? "Demo mode completes the purchase without charging a real payment method." : paymentMethod === "zinipay" ? "You will pay in BDT with ZiniPay (bKash, Nagad and more). Codes are delivered as soon as the payment is confirmed." : paymentMethod === "cryptomus" ? "You will pay in USD with crypto through Cryptomus. Codes are delivered once the blockchain payment is confirmed." : "Placing an order reserves inventory. Codes are delivered after Stripe confirms payment."}</p></>
          : <p className="checkout-empty">Your cart is empty. Choose a product and add a quantity to continue.</p>}
        </section>
      </div>}
      <a className="checkout-back-link" href="/catalog">← Back to products</a>
    </div>
  </main>;
}
