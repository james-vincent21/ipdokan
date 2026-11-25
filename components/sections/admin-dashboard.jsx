"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminDashboardCache, clearAdminDashboardCache, setAdminDashboardCache } from "@/lib/admin-dashboard-cache";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { SupplierImport, SupplierOrderActions, SupplierPlanBrowser, SupplierVariantEditor, emptySupplierVariant, useSupplierLocations } from "./admin-supplier";
import { AdminWalletCredit } from "./admin-wallet-credit";
import { AdminDevMode } from "./admin-dev-mode";
import { OrderFilterBar, buildRevenueChart, defaultOrderFilter, filterOrders, isFilterActive, summarizeOrders, variantOptions } from "./admin-order-filter";
import { useErrorToast } from "@/lib/toast";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const tabs = ["Overview", "Products", "Orders", "Users", "Reviews", "Product history", "Admins"];
const productCategories = ["Discount Proxy Panel", "Monthly ISP Proxy", "Dedicated Servers", "Private Proxy", "Residential Static Proxy", "VPS"];
const parseCodes = (text) => String(text || "").split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
const emptyVariant = { name: "", capacity: "", unit: "GB", price: "", priceUsd: "", priceBdt: "", codesText: "" };
const emptyProduct = { name: "", codeNumber: "", description: "", imageUrl: "", category: "Discount Proxy Panel", brand: "", price: "", priceUsd: "", priceBdt: "", currency: "USD", discountPercent: "0", rating: "0", reviewCount: "0", showInPopular: true, popularOrder: "0", active: true, quantity: "10", inventoryCodes: "", variants: [], source: "manual", supplierCategory: "" };

export function AdminDashboard() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState({ stats: null, chart: [], recentOrders: [] });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const creditRef = useRef(null);
  const [admins, setAdmins] = useState([]);
  const [productActivity, setProductActivity] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [product, setProduct] = useState(emptyProduct);
  const [editingId, setEditingId] = useState("");
  const [codes, setCodes] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [stockVariantId, setStockVariantId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useErrorToast(error && error.includes("Admin access is not configured") ? `${error} Add this account email to ADMIN_EMAILS in the backend environment, then restart the API.` : error);
  const [loading, setLoading] = useState(true);
  const [orderFilter, setOrderFilter] = useState(defaultOrderFilter);
  const [chartCurrency, setChartCurrency] = useState("USD");
  const [locationOptions, rememberLocations] = useSupplierLocations();
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  useErrorToast(imageError);
  const isApiProduct = product.source === "myproxyapi";
  const filteredOrders = useMemo(() => filterOrders(orders, orderFilter), [orders, orderFilter]);
  const orderSummary = useMemo(() => summarizeOrders(filteredOrders), [filteredOrders]);
  const revenueChart = useMemo(() => buildRevenueChart(filteredOrders, orderFilter, chartCurrency), [filteredOrders, orderFilter, chartCurrency]);
  const filterVariants = useMemo(() => variantOptions(orders, products), [orders, products]);
  const filterActive = isFilterActive(orderFilter);
  const overviewLimit = filterActive ? 50 : 8;
  const filterBar = <OrderFilterBar filter={orderFilter} onChange={setOrderFilter} variants={filterVariants} total={orders.length} shown={filteredOrders.length} />;

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${apiUrl}/api${path}`, { ...options, credentials: "include", headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }, []);

  // Uploads the chosen file to Cloudinary through the API; the returned URL is saved with the product.
  async function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type)) return setImageError("Choose a JPG, PNG, WebP, GIF or AVIF image.");
    if (file.size > 5 * 1024 * 1024) return setImageError("The image must be 5 MB or smaller.");
    setImageUploading(true);
    try {
      const result = await api("/admin/uploads/product-image", { method: "POST", body: file, headers: { "Content-Type": file.type } });
      setProduct((current) => ({ ...current, imageUrl: result.url }));
    } catch (uploadError) { setImageError(uploadError.message); }
    finally { setImageUploading(false); }
  }

  const refresh = useCallback(async (force = false) => {
    if (!force && adminDashboardCache) {
      setData(adminDashboardCache.data || { stats: null, chart: [], recentOrders: [] }); setProducts(adminDashboardCache.products || []); setOrders(adminDashboardCache.orders || []); setUsers(adminDashboardCache.users || []); setAdmins(adminDashboardCache.admins || []); setProductActivity(adminDashboardCache.productActivity || []); setReviews(adminDashboardCache.reviews || []); setLoading(false);
      return;
    }
    setLoading(true); setError("");
    try {
      const [overview, productData, orderData, userData, adminData, activityData, reviewData] = await Promise.all([api("/admin/overview"), api("/admin/products"), api("/admin/orders"), api("/admin/users"), api("/admin/admins"), api("/admin/product-activity"), api("/admin/reviews")]);
      const snapshot = { data: overview, products: productData.products || [], orders: orderData.orders || [], users: userData.users || [], admins: adminData.admins || [], productActivity: activityData.activity || [], reviews: reviewData.reviews || [] };
      setAdminDashboardCache(snapshot);
      setData(snapshot.data); setProducts(snapshot.products); setOrders(snapshot.orders); setUsers(snapshot.users); setAdmins(snapshot.admins); setProductActivity(snapshot.productActivity); setReviews(snapshot.reviews);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [api]);

  async function addAdmin(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const result = await api("/admin/admins", { method: "POST", body: JSON.stringify({ email: adminEmail }) });
      setAdminEmail(""); setMessage(`${result.admin.email} can access the admin panel after signing in.`); await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  // Ban signs the user out everywhere and blocks sign-in; delete removes the account (orders are kept).
  async function banUser(user) {
    const reason = window.prompt(`Ban ${user.email}? They are signed out everywhere and cannot sign in until you unban them.\n\nReason (optional, for your records):`, "");
    if (reason === null) return;
    setError(""); setMessage("");
    try { await api(`/admin/users/${user.id}/ban`, { method: "POST", body: JSON.stringify({ reason }) }); setMessage(`${user.email} is banned.`); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  async function unbanUser(user) {
    if (!window.confirm(`Unban ${user.email}? They can sign in again.`)) return;
    setError(""); setMessage("");
    try { await api(`/admin/users/${user.id}/unban`, { method: "POST" }); setMessage(`${user.email} can sign in again.`); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete the account ${user.email}?\n\nTheir sign-in, cart and notifications are removed. Orders and wallet history are kept. This cannot be undone.`)) return;
    setError(""); setMessage("");
    try {
      try { await api(`/admin/users/${user.id}`, { method: "DELETE" }); }
      catch (requestError) {
        // A wallet with money in it needs a second confirmation.
        if (!/wallet/i.test(requestError.message) || !window.confirm(`${requestError.message}`)) throw requestError;
        await api(`/admin/users/${user.id}?confirmBalance=1`, { method: "DELETE" });
      }
      setMessage(`${user.email} was deleted.`); await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  async function removeAdmin(admin) {
    if (!admin.id || !window.confirm(`Remove admin access for ${admin.email}?`)) return;
    setError(""); setMessage("");
    try { await api(`/admin/admins/${admin.id}`, { method: "DELETE" }); setMessage(`Admin access removed for ${admin.email}.`); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  async function saveReviewReply(event, review) {
    event.preventDefault(); setError(""); setMessage("");
    const reply = new FormData(event.currentTarget).get("reply");
    try { await api(`/admin/products/${review.productId}/reviews/${review.id}/reply`, { method: "PATCH", body: JSON.stringify({ reply }) }); setMessage("Admin reply saved."); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteReview(review) {
    if (!window.confirm(`Delete this comment on ${review.productName}?`)) return;
    setError(""); setMessage("");
    try { await api(`/admin/products/${review.productId}/reviews/${review.id}`, { method: "DELETE" }); setMessage("Comment deleted."); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  useEffect(() => {
    const clearCache = () => { clearAdminDashboardCache(); };
    window.addEventListener("ipdokan:signout", clearCache);
    refresh();
    return () => window.removeEventListener("ipdokan:signout", clearCache);
  }, [refresh]);

  async function saveProduct(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const method = editingId ? "PATCH" : "POST";
      const path = editingId ? `/admin/products/${editingId}` : "/admin/products";
      if (!product.variants.length) throw new Error("Add at least one variant and set its price there.");
      if (product.source === "myproxyapi") {
        const variants = product.variants.map((variant) => ({ ...(variant.id ? { id: variant.id } : {}), name: String(variant.name || "").trim(), priceUsd: Number(variant.priceUsd), priceBdt: Number(variant.priceBdt), supplier: { planId: Number(variant.planId), period: variant.period, locations: String(variant.locations || "").trim(), protocol: variant.protocol } }));
        const lowestUsdPrice = Math.min(...variants.map((variant) => variant.priceUsd));
        const lowestBdtPrice = Math.min(...variants.map((variant) => variant.priceBdt));
        const body = { ...product, price: lowestUsdPrice, priceUsd: lowestUsdPrice, priceBdt: lowestBdtPrice, discountPercent: Number(product.discountPercent), rating: Number(product.rating), reviewCount: Number(product.reviewCount), popularOrder: Number(product.popularOrder), variants };
        delete body.inventoryCodes; delete body.quantity;
        await api(path, { method, body: JSON.stringify(body) });
        setProduct(emptyProduct); setEditingId(""); setMessage(editingId ? "API product updated." : "API product added. It is now on sale in its category."); await refresh(true);
        return;
      }
      for (let index = 0; index < product.variants.length; index += 1) {
        const variant = product.variants[index];
        const label = `Variant ${index + 1}`;
        if (!String(variant.capacity || "").trim()) throw new Error(`${label}: Capacity is required (for example, 5 or 10).`);
        const capacity = Number(variant.capacity);
        if (!Number.isFinite(capacity) || capacity <= 0) throw new Error(`${label}: Capacity must be greater than 0.`);
        if (!variant.price || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0) throw new Error(`${label}: Price is required and must be a valid number.`);
        if (variant.priceUsd === "" || !Number.isFinite(Number(variant.priceUsd)) || Number(variant.priceUsd) < 0) throw new Error(`${label}: USD price is required.`);
        if (variant.priceBdt === "" || !Number.isFinite(Number(variant.priceBdt)) || Number(variant.priceBdt) < 0) throw new Error(`${label}: BDT price is required.`);
        if (!variant.id && !parseCodes(variant.codesText).length) throw new Error(`${label}: Add at least one code (one code per line).`);
      }
      const enteredCodes = product.variants.flatMap((variant) => parseCodes(variant.codesText));
      const duplicateCode = enteredCodes.find((code, index) => enteredCodes.indexOf(code) !== index);
      if (duplicateCode) throw new Error(`The code "${duplicateCode}" is entered more than once. Each code must be unique.`);
      const variants = product.variants.map((variant) => {
        const name = variant.capacity ? `${String(variant.capacity).trim()} ${variant.unit || "GB"}` : String(variant.name || "").trim();
        const codes = parseCodes(variant.codesText);
        if (variant.id) return { id: variant.id, name, price: Number(variant.price), priceUsd: Number(variant.priceUsd), priceBdt: Number(variant.priceBdt), newCodes: codes };
        return { name, price: Number(variant.price), priceUsd: Number(variant.priceUsd), priceBdt: Number(variant.priceBdt), codes };
      });
      const lowestUsdPrice = Math.min(...variants.map((variant) => variant.priceUsd));
      const lowestBdtPrice = Math.min(...variants.map((variant) => variant.priceBdt));
      const body = { ...product, price: lowestUsdPrice, priceUsd: lowestUsdPrice, priceBdt: lowestBdtPrice, discountPercent: Number(product.discountPercent), rating: Number(product.rating), reviewCount: Number(product.reviewCount), popularOrder: Number(product.popularOrder), variants };
      if (!editingId) { body.quantity = 0; body.codes = []; }
      delete body.inventoryCodes;
      await api(path, { method, body: JSON.stringify(body) });
      setProduct(emptyProduct); setEditingId(""); setMessage(editingId ? "Product updated." : "Product added."); await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  async function saveStock(event) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const result = await api(`/admin/products/${editingId}/stock`, { method: "PATCH", body: JSON.stringify({ quantity: Number(stockQuantity), codes: codes.split(/\r?\n/), variantId: stockVariantId || undefined }) });
      setCodes(""); setMessage(`Stock quantity updated: ${result.stockAvailable} available.`); await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  async function markPaid(order) {
    setError(""); setMessage("");
    try {
      const result = await api(`/admin/orders/${order._id}/confirm-payment`, { method: "POST" });
      setMessage(order.source === "myproxyapi"
        ? (result.order?.status === "paid" ? `Payment confirmed for ${order.productName}; the proxies were ordered from MyProxyApi.` : `Payment confirmed, but ordering from MyProxyApi failed: ${result.order?.supplierError || "see the order"}.`)
        : `Payment confirmed for ${order.productName}; ${order.quantity || 1} code(s) were delivered.`);
      await refresh(true);
    }
    catch (requestError) { setError(requestError.message); }
  }

  // Permanent: removes the order and its amount from income (e.g. demo or test orders).
  async function deleteOrder(order) {
    const label = `#${String(order._id).slice(-7)} — ${order.productName}, ${order.currency} ${Number(order.amount).toFixed(2)}, ${order.userEmail || order.userName || "customer"}`;
    const effect = order.status === "paid" ? `\n\nThis paid order's amount will be removed from income. Delivered codes stay sold and no money is refunded.` : order.status === "pending" ? "\n\nIts reserved stock goes back to the product." : "";
    if (!window.confirm(`Delete order ${label} permanently?${effect}\n\nThis cannot be undone.`)) return;
    setError(""); setMessage("");
    try {
      await api(`/admin/orders/${order._id}`, { method: "DELETE" });
      setMessage(`Order #${String(order._id).slice(-7)} deleted.${order.status === "paid" ? ` ${order.currency} ${Number(order.amount).toFixed(2)} removed from income.` : ""}`);
      await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  async function cancelOrder(order) {
    if (!window.confirm(`Cancel order #${String(order._id).slice(-7)} and restore its reserved stock?`)) return;
    setError(""); setMessage("");
    try { await api(`/admin/orders/${order._id}/cancel`, { method: "POST" }); setMessage("Order cancelled and its reserved stock restored."); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
  }

  async function deleteProduct(productToDelete) {
    if (!window.confirm(`Delete "${productToDelete.name}" permanently?`)) return;
    setError(""); setMessage("");
    try {
      await api(`/admin/products/${productToDelete.id}`, { method: "DELETE" });
      if (editingId === productToDelete.id) { setEditingId(""); setProduct(emptyProduct); }
      setMessage("Product deleted.");
      await refresh(true);
    } catch (requestError) { setError(requestError.message); }
  }

  function edit(productToEdit) {
    setEditingId(productToEdit._id); setProduct({ name: productToEdit.name, codeNumber: productToEdit.codeNumber, description: productToEdit.description || "", imageUrl: productToEdit.imageUrl || "", category: productToEdit.category || "Other", brand: productToEdit.brand || "", price: String(productToEdit.price), priceUsd: String(productToEdit.priceUsd ?? productToEdit.price ?? ""), priceBdt: String(productToEdit.priceBdt ?? ""), currency: productToEdit.currency || "USD", discountPercent: String(productToEdit.discountPercent || 0), rating: String(productToEdit.rating || 0), reviewCount: String(productToEdit.reviewCount || 0), showInPopular: Boolean(productToEdit.showInPopular), popularOrder: String(productToEdit.popularOrder || 0), active: productToEdit.active, quantity: String(productToEdit.stockAvailable), inventoryCodes: "", source: productToEdit.source || "manual", supplierCategory: productToEdit.supplierCategory || "", variants: (productToEdit.variants || []).map((variant) => {
      if (productToEdit.source === "myproxyapi") return { id: variant._id, name: variant.name, priceUsd: String(variant.priceUsd ?? variant.price ?? ""), priceBdt: String(variant.priceBdt ?? ""), planId: String(variant.supplier?.planId ?? ""), period: variant.supplier?.period || "1", locations: variant.supplier?.locations || "", protocol: variant.supplier?.protocol || "http", costUsd: variant.supplier?.costUsd ?? null, planName: variant.supplier?.planName || "" };
      const match = String(variant.name || "").trim().match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
      return { id: variant._id, name: variant.name, capacity: match?.[1] || "", unit: match?.[2]?.toUpperCase() || "GB", price: String(variant.price), priceUsd: String(variant.priceUsd ?? variant.price ?? ""), priceBdt: String(variant.priceBdt ?? ""), codesText: "", legacyStock: variant.stockQuantity !== null && variant.stockQuantity !== undefined, available: variant.stockQuantity ?? variant.codes.filter((code) => code.status === "available").length };
    }) }); setCodes(""); setStockVariantId(productToEdit.variants?.[0]?._id || ""); setStockQuantity(String(productToEdit.variants?.[0]?.stockQuantity ?? productToEdit.variants?.[0]?.codes?.filter((code) => code.status === "available").length ?? productToEdit.stockAvailable));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main className="admin-page">
    {/* Overview and Orders are wide tables and charts: they use the full screen width. */}
    <div className={`admin-shell${tab === "Overview" || tab === "Orders" ? " is-wide" : ""}`}>
      <header className="admin-heading"><div><span className="auth-kicker">IP DOKAN CONTROL ROOM</span><h1>Admin panel</h1><p>Manage your catalog, inventory codes, users, and orders.</p></div><button type="button" className="admin-refresh" onClick={() => refresh(true)}>Refresh</button></header>
      <nav className="admin-tabs" aria-label="Admin sections">{tabs.map((item) => <button key={item} type="button" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {message && <p className="admin-notice" role="status">{message}</p>}
      {loading ? <p className="admin-loading">Loading admin data…</p> : error && !data.stats ? <p className="admin-loading">Sign in with an authorized admin account to continue.</p> : <>
        {tab === "Overview" && <><AdminDevMode api={api} />
          {filterBar}
          <section className="admin-stat-grid">{[["Orders", orderSummary.orders], ["Units sold", orderSummary.paidUnits], ["Revenue (USD)", `$${orderSummary.revenue.USD.toFixed(2)}`], ["Revenue (BDT)", `৳${orderSummary.revenue.BDT.toFixed(2)}`]].map(([label, value]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
          <p className="admin-filter-note">{data.stats.products ?? 0} products · {data.stats.users ?? 0} users · {orderSummary.pending} pending order(s) in this view</p>
          <section className="admin-card admin-chart-card"><div className="admin-card-heading"><div><h2>Revenue</h2><p>Paid orders {revenueChart.daily ? "per day" : "per month"}{filterActive ? " for the current filter" : ""}</p></div><div className="admin-currency-toggle" role="group" aria-label="Chart currency">{["USD", "BDT"].map((currency) => <button key={currency} type="button" className={chartCurrency === currency ? "is-active" : ""} aria-pressed={chartCurrency === currency} onClick={() => setChartCurrency(currency)}>{currency}</button>)}</div></div><div className="admin-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={revenueChart.data}><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5687ff" stopOpacity={0.4} /><stop offset="95%" stopColor="#5687ff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} /><XAxis dataKey="label" stroke="#8894aa" tickLine={false} axisLine={false} minTickGap={16} /><YAxis stroke="#8894aa" tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#111827", border: "1px solid #29364d", borderRadius: 10 }} formatter={(value, name) => name === "revenue" ? [`${chartCurrency === "BDT" ? "৳" : "$"}${Number(value).toFixed(2)}`, "Revenue"] : [value, name]} /><Area type="monotone" dataKey="revenue" stroke="#78a0ff" strokeWidth={2} fill="url(#revenueFill)" /></AreaChart></ResponsiveContainer></div></section>
          <section className="admin-card"><h2>{filterActive ? "Matching orders" : "Recent orders"}</h2><OrderTable orders={filteredOrders.slice(0, overviewLimit)} emptyText={filterActive ? "No orders match these filters." : undefined} />{filteredOrders.length > overviewLimit && <button type="button" className="admin-secondary admin-view-all" onClick={() => setTab("Orders")}>View all {filteredOrders.length} in Orders</button>}</section>
        </>}
        {tab === "Products" && <><SupplierImport api={api} onDone={() => refresh(true)} /><div className="admin-products-layout">
          <section className="admin-card"><h2>{editingId ? "Edit product" : "Add product"}</h2><form className="admin-form" onSubmit={saveProduct}>
            {editingId ? <p className="admin-help-text">Source: <b>{isApiProduct ? "MyProxyApi (automatic delivery)" : "Manual codes"}</b></p> : <label>Source <span className="admin-help-text">Manual: you add the codes. MyProxyApi: proxies are ordered and delivered automatically after payment.</span><select value={product.source} onChange={(event) => setProduct({ ...product, source: event.target.value, variants: [] })}><option value="manual">Manual codes</option><option value="myproxyapi">MyProxyApi (automatic)</option></select></label>}
            {isApiProduct && <SupplierPlanBrowser api={api} onUsePlan={(plan, storeCategory, supplierCategory) => { rememberLocations(plan); setProduct((current) => ({ ...current, category: current.variants.length ? current.category : storeCategory, supplierCategory: current.supplierCategory || supplierCategory, variants: [...current.variants, { ...emptySupplierVariant, planId: String(plan.id), name: plan.name.slice(0, 80) }] })); }} />}
            <label>Product name<input required maxLength={120} value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
            <label>Code number / SKU<input required maxLength={80} value={product.codeNumber} onChange={(event) => setProduct({ ...product, codeNumber: event.target.value })} /></label>
            <label>Description<textarea maxLength={2000} value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} /></label>
            <div className="admin-image-field"><span>Product image <span className="admin-help-text">Uploaded to Cloudinary. Click Save to keep it on the product.</span></span>
              <div className="admin-image-row">
                <div className="admin-image-preview">{product.imageUrl ? <img src={product.imageUrl} alt="Product preview" /> : <span>No image</span>}</div>
                <div className="admin-image-actions">
                  <label className={`admin-secondary admin-image-upload${imageUploading ? " is-busy" : ""}`}>{imageUploading ? "Uploading…" : product.imageUrl ? "Change image" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={imageUploading} onChange={uploadImage} /></label>
                  {product.imageUrl && <button type="button" className="admin-secondary" disabled={imageUploading} onClick={() => setProduct({ ...product, imageUrl: "" })}>Remove</button>}
                  <small className="admin-help-text">JPG, PNG, WebP, GIF or AVIF, up to 5 MB.</small>
                </div>
              </div>
              <label>Or paste an image URL<input type="url" placeholder="https://…" value={product.imageUrl} onChange={(event) => setProduct({ ...product, imageUrl: event.target.value })} /></label>
            </div>
            <label>Brand / provider <span className="admin-help-text">Products with the same brand appear together, for example 9proxy.</span><input placeholder="9proxy" value={product.brand} onChange={(event) => setProduct({ ...product, brand: event.target.value })} /></label>
            <label>Category <span className="admin-help-text">This product appears under the matching navigation category.</span><select required value={product.category} onChange={(event) => setProduct({ ...product, category: event.target.value })}>{!productCategories.includes(product.category) && product.category && <option value={product.category}>{product.category} (existing category)</option>}{productCategories.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}</select></label>
            <div className="admin-form-row"><label>Discount % <span className="admin-help-text">Shown as a badge only; the set product price is not reduced.</span><input type="number" min="0" max="99" value={product.discountPercent} onChange={(event) => setProduct({ ...product, discountPercent: event.target.value })} /></label><label>Rating (0–5)<input type="number" min="0" max="5" step="0.1" value={product.rating} onChange={(event) => setProduct({ ...product, rating: event.target.value })} /></label><label>Review count<input type="number" min="0" step="1" value={product.reviewCount} onChange={(event) => setProduct({ ...product, reviewCount: event.target.value })} /></label></div>
            <label className="admin-checkbox"><input type="checkbox" checked={product.showInPopular} onChange={(event) => setProduct({ ...product, showInPopular: event.target.checked })} />Show in Popular Products</label>
            <label>Popular display order <span className="admin-help-text">Smaller numbers appear first.</span><input type="number" min="0" max="10000" step="1" value={product.popularOrder} onChange={(event) => setProduct({ ...product, popularOrder: event.target.value })} /></label>
            {isApiProduct ? <SupplierVariantEditor api={api} variants={product.variants} locationOptions={locationOptions} onChange={(variants) => setProduct((current) => ({ ...current, variants }))} /> : <fieldset className="admin-variant-editor">
              <legend>Variants {editingId ? "(edit plan details)" : "(required)"}</legend>
              <p className="admin-help-text">Set the price for each plan here, then paste its codes one per line. The number of codes is the plan&apos;s quantity, and each buyer gets their own code after payment.</p>
              {product.variants.map((variant, index) => <div className="admin-variant-row" key={variant.id || index}>
                <div className="admin-variant-plan-row">
                  <label>Capacity<input required type="number" min="0" step="0.1" value={variant.capacity || ""} placeholder="9" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, capacity: event.target.value } : item) })} /></label>
                  <label>Unit<select value={variant.unit || "GB"} onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, unit: event.target.value } : item) })}><option value="GB">GB</option><option value="MB">MB</option></select></label>
                  <label>USD price<input required type="number" min="0" step="0.01" value={variant.priceUsd || ""} placeholder="5" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, priceUsd: event.target.value, price: event.target.value } : item) })} /></label>
                  <label>BDT price<input required type="number" min="0" step="0.01" value={variant.priceBdt || ""} placeholder="500" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, priceBdt: event.target.value } : item) })} /></label>
                  <button type="button" className="admin-secondary admin-variant-remove" onClick={() => setProduct({ ...product, variants: product.variants.filter((_, i) => i !== index) })}>Remove</button>
                </div>
                {(() => {
                  const entered = parseCodes(variant.codesText);
                  const unique = new Set(entered).size;
                  const current = variant.id && !variant.legacyStock ? Number(variant.available || 0) : 0;
                  return <div className="admin-variant-codes-row">
                    <label>{variant.id ? "Add new codes" : "Codes"} <span className="admin-help-text">One code per line. Each line adds 1 to the quantity.</span><textarea rows={4} required={!variant.id} value={variant.codesText || ""} placeholder={"CODE-AAAA-1111\nCODE-BBBB-2222\nCODE-CCCC-3333"} onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, codesText: event.target.value } : item) })} /></label>
                    <p className="admin-variant-available">
                      {variant.id && variant.legacyStock
                        ? (entered.length ? `Switches to code stock: quantity = ${entered.length}` : `Old quantity stock: ${variant.available} available. Adding codes replaces it.`)
                        : variant.id ? `Quantity: ${current} available + ${entered.length} new = ${current + entered.length}` : `Quantity: ${entered.length}`}
                      {unique !== entered.length && <span className="admin-variant-duplicate"> · {entered.length - unique} duplicate line(s)</span>}
                    </p>
                  </div>;
                })()}
              </div>)}
              <button type="button" className="admin-secondary" onClick={() => setProduct({ ...product, variants: [...product.variants, { ...emptyVariant }] })}>Add variant</button>
            </fieldset>}
            {editingId && <label className="admin-checkbox"><input type="checkbox" checked={product.active} onChange={(event) => setProduct({ ...product, active: event.target.checked })} />Visible in catalog</label>}
            <div className="admin-form-actions"><button className="auth-submit" type="submit">{editingId ? "Save product" : "Add product"}</button>{editingId && <button type="button" className="admin-secondary" onClick={() => { setEditingId(""); setProduct(emptyProduct); }}>Cancel</button>}</div>
          </form>
          {editingId && !isApiProduct && <form className="admin-form admin-code-form" onSubmit={saveStock}>
            <h3>Set available quantity</h3>
            <p>Lower the number to remove unsold codes. To raise it, paste exactly that many new codes below (or add them in the variant above).</p>
            {product.variants.some((variant) => variant.id) && <label>Plan / variant<select value={stockVariantId} onChange={(event) => {
              const variantId = event.target.value;
              setStockVariantId(variantId);
              const variant = product.variants.find((item) => item.id === variantId);
              setStockQuantity(String(variant?.available || 0));
              setCodes("");
            }}>{product.variants.filter((variant) => variant.id).map((variant) => <option key={variant.id} value={variant.id}>{variant.name}{variant.legacyStock ? " (old: 1 shared code)" : ""}</option>)}</select></label>}
            <label>Available quantity<input type="number" min="0" max="10000" step="1" required value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} /></label>
            {(!product.variants.length || !product.variants.find((item) => item.id === stockVariantId)?.legacyStock) && <label>New codes <span className="admin-help-text">One per line. Required only when increasing quantity.</span><textarea rows={5} value={codes} onChange={(event) => setCodes(event.target.value)} placeholder="Required only when increasing quantity" /></label>}
            <button type="submit" className="admin-secondary">Save quantity</button>
          </form>}</section>
          <section className="admin-card"><h2>Product inventory</h2><div className="admin-product-list">{products.map((item) => <article className="admin-product-row" key={item.id}><div className="admin-product-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : (item.name?.trim()?.charAt(0).toUpperCase() || "P")}</div><div className="admin-product-info"><strong>{item.name}{item.source === "myproxyapi" && <span className="admin-api-tag">API</span>}</strong>{item.source === "myproxyapi"
              ? <><span>{item.category || "Other"} · {item.codeNumber} · automatic delivery from MyProxyApi</span>{item.variants?.map((variant) => <small key={variant._id}>{variant.name} · {variant.priceUsd > 0 ? `USD ${variant.priceUsd}` : "USD not set"} / {variant.priceBdt > 0 ? `BDT ${variant.priceBdt}` : "BDT not set"} · cost ${Number(variant.supplier?.costUsd || 0).toFixed(2)} · plan #{variant.supplier?.planId}, {variant.supplier?.period}, location {variant.supplier?.locations || "customer chooses"}</small>)}</>
              : <><span>{item.category || "Other"} · {item.codeNumber} · {item.currency} {item.price} · {item.stockAvailable} available / {item.stockReserved || 0} reserved / {item.stockSold} sold</span>{item.variants?.map((variant) => <small key={variant._id}>{variant.name} · {item.currency} {variant.price} · {variant.stockQuantity ?? variant.codes.filter((code) => code.status === "available").length} available</small>)}</>}<small>{item.active ? "Visible" : "Hidden"}{item.showInPopular ? ` · Popular #${item.popularOrder || 0}` : ""}</small></div><div className="admin-product-actions"><button type="button" className="admin-secondary" onClick={() => edit(item)}>Edit</button><button type="button" className="admin-delete" onClick={() => deleteProduct(item)}>Delete</button></div></article>)}{!products.length && <p className="admin-empty">No products yet.</p>}</div></section>
        </div></>}
        {tab === "Orders" && <>{filterBar}<section className="admin-card"><h2>Orders <small>({filteredOrders.length})</small></h2><OrderTable orders={filteredOrders} onMarkPaid={markPaid} onCancel={cancelOrder} onDelete={deleteOrder} supplierProps={{ api, onDone: async (text) => { setError(""); setMessage(text); await refresh(true); }, onError: (text) => { setMessage(""); setError(text); } }} emptyText={filterActive ? "No orders match these filters." : undefined} /></section></>}
        {tab === "Users" && <><AdminWalletCredit ref={creditRef} api={api} onCredited={() => refresh(true)} /><section className="admin-card"><h2>Users <small>({users.length})</small></h2><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Purchases</th><th>Paid total</th><th>Purchase history</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className={user.banned ? "is-banned" : undefined}><td>{user.name || "—"}<small className="admin-user-id" title="User id">{String(user.id)}</small></td><td>{user.email}</td><td>{user.phone || "—"}</td><td>{user.orderCount}</td><td>{Object.entries(user.paidTotals || {}).length ? Object.entries(user.paidTotals).map(([currency, total]) => <small key={currency}>{currency} {Number(total).toFixed(2)}</small>) : "—"}</td><td><details className="admin-user-history"><summary>View {user.purchases?.length || 0}</summary><div>{user.purchases?.length ? user.purchases.map((purchase) => <article key={purchase.id}><strong>{purchase.productName}{purchase.variantName ? ` — ${purchase.variantName}` : ""} × {purchase.quantity}</strong><small>Invoice ID: {purchase.invoiceId || "—"}</small><span>{purchase.status} · {purchase.currency} {Number(purchase.amount).toFixed(2)}</span><time>{purchase.paidAt ? "Paid" : "Ordered"}: {new Date(purchase.paidAt || purchase.createdAt).toLocaleString()}</time></article>) : <p>No purchases yet.</p>}</div></details></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</td><td>{user.isAdmin ? <span className="user-status is-admin">Admin</span> : user.banned ? <span className="user-status is-banned" title={user.banReason || undefined}>Banned{user.banReason && <small>{user.banReason}</small>}</span> : <span className="user-status">Active</span>}</td><td>{user.isAdmin ? <div className="admin-user-actions">{user.emailVerified && <button type="button" className="admin-secondary" onClick={() => { creditRef.current?.pick(String(user.id)); document.querySelector(".admin-wallet-credit")?.scrollIntoView({ behavior: "smooth" }); }}>Credit</button>}</div> : <div className="admin-user-actions">{user.emailVerified ? <button type="button" className="admin-secondary" onClick={() => { creditRef.current?.pick(String(user.id)); document.querySelector(".admin-wallet-credit")?.scrollIntoView({ behavior: "smooth" }); }}>Credit</button> : <small className="admin-help-text" title="Only verified users can receive credit">Not verified</small>}{user.banned ? <button type="button" className="admin-secondary" onClick={() => unbanUser(user)}>Unban</button> : <button type="button" className="admin-secondary is-warning" onClick={() => banUser(user)}>Ban</button>}<button type="button" className="admin-danger" onClick={() => deleteUser(user)}>Delete</button></div>}</td></tr>)}</tbody></table></div></section></>}
        {tab === "Reviews" && <section className="admin-card"><h2>Product comments <small>({reviews.length})</small></h2><div className="admin-review-list">{reviews.map((review) => <article className="admin-review-card" key={`${review.productId}:${review.id}`}><header><div><strong>{review.productName}</strong><span>{review.userName} · {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} · ♥ {review.likeCount}</span></div><time>{review.createdAt ? new Date(review.createdAt).toLocaleString() : "—"}</time></header><p>{review.comment}</p><form className="admin-review-reply" onSubmit={(event) => saveReviewReply(event, review)}><label>Admin reply<textarea name="reply" rows={3} maxLength={1500} defaultValue={review.adminReply || ""} placeholder="Write a reply to this comment…" /></label><button type="submit" className="admin-secondary">Save reply</button><button type="button" className="admin-delete" onClick={() => deleteReview(review)}>Delete comment</button></form>{review.adminReply && <small className="admin-review-replied-by">Replied by {review.adminEmail || "admin"}{review.repliedAt ? ` · ${new Date(review.repliedAt).toLocaleString()}` : ""}</small>}</article>)}{!reviews.length && <p className="admin-empty">No product comments yet.</p>}</div></section>}
        {tab === "Product history" && <section className="admin-card"><h2>Product activity <small>({productActivity?.length || 0})</small></h2><p>Product add, edit, delete, stock renewal, and cancellation events, with the admin and exact time.</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Product</th><th>Action</th><th>Admin</th><th>Details</th><th>Date and time</th></tr></thead><tbody>{(productActivity || []).map((entry) => <tr key={entry._id}><td>{entry.productName}</td><td>{({ added: "Added", edited: "Edited", deleted: "Deleted", stock_renewed: "Stock renewed", codes_added: "Codes added", order_cancelled: "Order cancelled — stock returned" })[entry.action] || entry.action}</td><td>{entry.adminEmail}</td><td>{entry.details || "—"}</td><td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!productActivity?.length && <p className="admin-empty">No product activity recorded yet.</p>}</div></section>}
        {tab === "Admins" && <section className="admin-card"><h2>Admin access</h2><p>Add an account email. That person will see the admin dashboard after signing in with the same email.</p><form className="admin-form admin-code-form" onSubmit={addAdmin}><label>Email address<input type="email" required maxLength={254} value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@example.com" /></label><button type="submit" className="auth-submit">Add admin</button></form><div className="admin-product-list">{admins.map((admin) => <article className="admin-product-row" key={admin.id || admin.email}><div className="admin-product-info"><strong>{admin.email}</strong><span>{admin.source}{admin.addedAt ? ` · Added ${new Date(admin.addedAt).toLocaleDateString()}` : " · Set in backend environment"}</span></div>{admin.id && <button type="button" className="admin-delete" onClick={() => removeAdmin(admin)}>Remove</button>}</article>)}</div></section>}
      </>}
    </div>
  </main>;
}

function OrderTable({ orders, onMarkPaid, onCancel, onDelete, supplierProps, emptyText = "No orders yet." }) {
  const pendingAction = (order) => <div className="admin-order-actions"><button type="button" className="admin-confirm" onClick={() => onMarkPaid(order)}>Confirm paid</button>{onCancel && <button type="button" className="admin-cancel-order" onClick={() => onCancel(order)}>Cancel</button>}</div>;
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>{orders.map((order) => {
    const codes = order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : [];
    const statusLabel = order.source === "myproxyapi" && order.status === "processing" ? (order.supplierError ? "Paid — delivery failed" : "Paid — ordering proxies") : order.source === "myproxyapi" && order.status === "paid" && order.supplierDeliveryPending ? "Paid — waiting for proxies" : order.status === "cancelled" ? "Cancelled — stock restored" : order.status === "pending" ? "Pending — reserved" : order.status;
    return <tr key={order._id}><td>#{String(order._id).slice(-7)}<small>{order.invoiceId}</small></td><td>{order.userName}<small>{order.userEmail}</small></td><td>{order.productName}{order.source === "myproxyapi" && <span className="admin-api-tag">API</span>}<small>{order.variantName || order.codeNumber}</small></td><td>{order.quantity || 1}</td><td>{order.currency} {Number(order.amount).toFixed(2)}</td><td><span className={`order-status order-status-${order.status}`}>{statusLabel}</span></td><td>{new Date(order.createdAt).toLocaleString()}</td><td>{order.status === "pending" && onMarkPaid ? pendingAction(order) : <>{codes.map((code) => <code className="admin-delivered-code" key={code}>{code}</code>)}{order.status === "paid" && <button type="button" className="invoice-download" onClick={() => downloadInvoicePdf(order)}>Download invoice PDF</button>}{order.source === "myproxyapi" && supplierProps && <SupplierOrderActions order={order} {...supplierProps} />}</>}{onDelete && order.status !== "processing" && <button type="button" className="admin-delete-order" onClick={() => onDelete(order)}>Delete</button>}</td></tr>;
  })}</tbody></table>{!orders.length && <p className="admin-empty">{emptyText}</p>}</div>;
}
