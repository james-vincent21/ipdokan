"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { adminDashboardCache, clearAdminDashboardCache, setAdminDashboardCache } from "@/lib/admin-dashboard-cache";
import { downloadInvoicePdf } from "@/lib/invoice-download";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const tabs = ["Overview", "Products", "Orders", "Users", "Reviews", "Product history", "Admins"];
const productCategories = ["Discount Proxy Panel", "Monthly ISP Proxy", "Dedicated Servers", "Private Proxy", "Residential Static Proxy", "VPS"];
const emptyProduct = { name: "", codeNumber: "", description: "", imageUrl: "", category: "Discount Proxy Panel", brand: "", price: "", priceUsd: "", priceBdt: "", currency: "USD", discountPercent: "0", rating: "0", reviewCount: "0", showInPopular: true, popularOrder: "0", active: true, quantity: "10", inventoryCodes: "", variants: [] };

export function AdminDashboard() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState({ stats: null, chart: [], recentOrders: [] });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
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
  const [loading, setLoading] = useState(true);

  const api = useCallback(async (path, options = {}) => {
    const response = await fetch(`${apiUrl}/api${path}`, { ...options, credentials: "include", headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }, []);

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
      for (let index = 0; index < product.variants.length; index += 1) {
        const variant = product.variants[index];
        const label = `Variant ${index + 1}`;
        if (!String(variant.capacity || "").trim()) throw new Error(`${label}: Capacity is required (for example, 5 or 10).`);
        const capacity = Number(variant.capacity);
        if (!Number.isFinite(capacity) || capacity <= 0) throw new Error(`${label}: Capacity must be greater than 0.`);
        if (!variant.price || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0) throw new Error(`${label}: Price is required and must be a valid number.`);
        if (variant.priceUsd === "" || !Number.isFinite(Number(variant.priceUsd)) || Number(variant.priceUsd) < 0) throw new Error(`${label}: USD price is required.`);
        if (variant.priceBdt === "" || !Number.isFinite(Number(variant.priceBdt)) || Number(variant.priceBdt) < 0) throw new Error(`${label}: BDT price is required.`);
        if (!editingId) {
          const quantity = Number(variant.quantity);
          if (!Number.isInteger(quantity) || quantity < 0) throw new Error(`${label}: Quantity must be a whole number of 0 or more.`);
        }
        if (!String(variant.secretCode || "").trim()) throw new Error(`${label}: One secret code is required.`);
      }
      const variants = product.variants.map((variant) => {
        const name = variant.capacity ? `${String(variant.capacity).trim()} ${variant.unit || "GB"}` : String(variant.name || "").trim();
        if (variant.id) return { id: variant.id, name, price: Number(variant.price), priceUsd: Number(variant.priceUsd), priceBdt: Number(variant.priceBdt), quantity: Number(variant.quantity ?? variant.available ?? 0), secretCode: String(variant.secretCode || "").trim() };
        return { name, price: Number(variant.price), priceUsd: Number(variant.priceUsd), priceBdt: Number(variant.priceBdt), quantity: Number(variant.quantity || 0), secretCode: String(variant.secretCode || "").trim() };
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
    try { await api(`/admin/orders/${order._id}/confirm-payment`, { method: "POST" }); setMessage(`Payment confirmed for ${order.productName}; ${order.quantity || 1} code(s) were delivered.`); await refresh(true); }
    catch (requestError) { setError(requestError.message); }
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
    setEditingId(productToEdit._id); setProduct({ name: productToEdit.name, codeNumber: productToEdit.codeNumber, description: productToEdit.description || "", imageUrl: productToEdit.imageUrl || "", category: productToEdit.category || "Other", brand: productToEdit.brand || "", price: String(productToEdit.price), priceUsd: String(productToEdit.priceUsd ?? productToEdit.price ?? ""), priceBdt: String(productToEdit.priceBdt ?? ""), currency: productToEdit.currency || "USD", discountPercent: String(productToEdit.discountPercent || 0), rating: String(productToEdit.rating || 0), reviewCount: String(productToEdit.reviewCount || 0), showInPopular: Boolean(productToEdit.showInPopular), popularOrder: String(productToEdit.popularOrder || 0), active: productToEdit.active, quantity: String(productToEdit.stockAvailable), inventoryCodes: "", variants: (productToEdit.variants || []).map((variant) => {
      const match = String(variant.name || "").trim().match(/^(\d+(?:\.\d+)?)\s*(MB|GB)$/i);
      return { id: variant._id, name: variant.name, capacity: match?.[1] || "", unit: match?.[2]?.toUpperCase() || "GB", price: String(variant.price), priceUsd: String(variant.priceUsd ?? variant.price ?? ""), priceBdt: String(variant.priceBdt ?? ""), secretCode: variant.secretCode || "", available: variant.stockQuantity ?? variant.codes.filter((code) => code.status === "available").length };
    }) }); setCodes(""); setStockVariantId(productToEdit.variants?.[0]?._id || ""); setStockQuantity(String(productToEdit.variants?.[0]?.stockQuantity ?? productToEdit.variants?.[0]?.codes?.filter((code) => code.status === "available").length ?? productToEdit.stockAvailable));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main className="admin-page">
    <div className="admin-shell">
      <header className="admin-heading"><div><span className="auth-kicker">IP DOKAN CONTROL ROOM</span><h1>Admin panel</h1><p>Manage your catalog, inventory codes, users, and orders.</p></div><button type="button" className="admin-refresh" onClick={() => refresh(true)}>Refresh</button></header>
      <nav className="admin-tabs" aria-label="Admin sections">{tabs.map((item) => <button key={item} type="button" className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item}</button>)}</nav>
      {error && <p className="admin-notice is-error" role="alert">{error}{error.includes("Admin access is not configured") && <span> Add this account email to ADMIN_EMAILS in the backend environment, then restart the API.</span>}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      {loading ? <p className="admin-loading">Loading admin data…</p> : error && !data.stats ? <p className="admin-loading">Sign in with an authorized admin account to continue.</p> : <>
        {tab === "Overview" && <>
          <section className="admin-stat-grid">{[["Products", data.stats.products], ["Users", data.stats.users], ["Orders", data.stats.orders], ["Paid revenue", `$${Number(data.stats.revenue || 0).toFixed(2)}`]].map(([label, value]) => <article className="admin-stat" key={label}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</section>
          <section className="admin-card admin-chart-card"><div className="admin-card-heading"><div><h2>Revenue</h2><p>Paid orders over the last six months</p></div></div><div className="admin-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.chart}><defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5687ff" stopOpacity={0.4} /><stop offset="95%" stopColor="#5687ff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} /><XAxis dataKey="month" stroke="#8894aa" tickLine={false} axisLine={false} /><YAxis stroke="#8894aa" tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: "#111827", border: "1px solid #29364d", borderRadius: 10 }} /><Area type="monotone" dataKey="revenue" stroke="#78a0ff" strokeWidth={2} fill="url(#revenueFill)" /></AreaChart></ResponsiveContainer></div></section>
          <section className="admin-card"><h2>Recent orders</h2><OrderTable orders={data.recentOrders} /></section>
        </>}
        {tab === "Products" && <div className="admin-products-layout">
          <section className="admin-card"><h2>{editingId ? "Edit product" : "Add product"}</h2><form className="admin-form" onSubmit={saveProduct}>
            <label>Product name<input required maxLength={120} value={product.name} onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
            <label>Code number / SKU<input required maxLength={80} value={product.codeNumber} onChange={(event) => setProduct({ ...product, codeNumber: event.target.value })} /></label>
            <label>Description<textarea maxLength={2000} value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} /></label>
            <label>Image URL<input type="url" placeholder="https://…" value={product.imageUrl} onChange={(event) => setProduct({ ...product, imageUrl: event.target.value })} /></label>
            <label>Brand / provider <span className="admin-help-text">Products with the same brand appear together, for example 9proxy.</span><input placeholder="9proxy" value={product.brand} onChange={(event) => setProduct({ ...product, brand: event.target.value })} /></label>
            <label>Category <span className="admin-help-text">This product appears under the matching navigation category.</span><select required value={product.category} onChange={(event) => setProduct({ ...product, category: event.target.value })}>{!productCategories.includes(product.category) && product.category && <option value={product.category}>{product.category} (existing category)</option>}{productCategories.map((categoryName) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}</select></label>
            <div className="admin-form-row"><label>Discount % <span className="admin-help-text">Shown as a badge only; the set product price is not reduced.</span><input type="number" min="0" max="99" value={product.discountPercent} onChange={(event) => setProduct({ ...product, discountPercent: event.target.value })} /></label><label>Rating (0–5)<input type="number" min="0" max="5" step="0.1" value={product.rating} onChange={(event) => setProduct({ ...product, rating: event.target.value })} /></label><label>Review count<input type="number" min="0" step="1" value={product.reviewCount} onChange={(event) => setProduct({ ...product, reviewCount: event.target.value })} /></label></div>
            <label className="admin-checkbox"><input type="checkbox" checked={product.showInPopular} onChange={(event) => setProduct({ ...product, showInPopular: event.target.checked })} />Show in Popular Products</label>
            <label>Popular display order <span className="admin-help-text">Smaller numbers appear first.</span><input type="number" min="0" max="10000" step="1" value={product.popularOrder} onChange={(event) => setProduct({ ...product, popularOrder: event.target.value })} /></label>
            <fieldset className="admin-variant-editor">
              <legend>Variants {editingId ? "(edit plan details)" : "(required)"}</legend>
              <p className="admin-help-text">Set the price for each plan here. Example: 5 GB / USD $5 / ৳500 / 12 available / one secret code.</p>
              {product.variants.map((variant, index) => <div className="admin-variant-row" key={variant.id || index}>
                <div className="admin-variant-plan-row">
                  <label>Capacity<input required type="number" min="0" step="0.1" value={variant.capacity || ""} placeholder="9" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, capacity: event.target.value } : item) })} /></label>
                  <label>Unit<select value={variant.unit || "GB"} onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, unit: event.target.value } : item) })}><option value="GB">GB</option><option value="MB">MB</option></select></label>
                  <label>USD price<input required type="number" min="0" step="0.01" value={variant.priceUsd || ""} placeholder="5" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, priceUsd: event.target.value, price: event.target.value } : item) })} /></label>
                  <label>BDT price<input required type="number" min="0" step="0.01" value={variant.priceBdt || ""} placeholder="500" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, priceBdt: event.target.value } : item) })} /></label>
                  <button type="button" className="admin-secondary admin-variant-remove" onClick={() => setProduct({ ...product, variants: product.variants.filter((_, i) => i !== index) })}>Remove</button>
                </div>
                <div className="admin-variant-stock-row">
                  <label>Available quantity<input required type="number" min="0" max="10000" value={variant.quantity ?? variant.available ?? 0} onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) })} /></label>
                  <label>Secret code <span className="admin-help-text">Revealed after payment</span><input required value={variant.secretCode || ""} placeholder="One code for this plan" onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, i) => i === index ? { ...item, secretCode: event.target.value } : item) })} /></label>
                </div>
              </div>)}
              <button type="button" className="admin-secondary" onClick={() => setProduct({ ...product, variants: [...product.variants, { name: "", capacity: "", unit: "GB", price: "", priceUsd: "", priceBdt: "", quantity: "0", secretCode: "" }] })}>Add variant</button>
            </fieldset>
            {editingId && <label className="admin-checkbox"><input type="checkbox" checked={product.active} onChange={(event) => setProduct({ ...product, active: event.target.checked })} />Visible in catalog</label>}
            <div className="admin-form-actions"><button className="auth-submit" type="submit">{editingId ? "Save product" : "Add product"}</button>{editingId && <button type="button" className="admin-secondary" onClick={() => { setEditingId(""); setProduct(emptyProduct); }}>Cancel</button>}</div>
          </form>
          {editingId && <form className="admin-form admin-code-form" onSubmit={saveStock}>
            <h3>Set available quantity</h3>
            <p>Set how many units are available for this plan. The secret code was already set inside the variant and is revealed after payment.</p>
            {product.variants.length > 0 && <label>Plan / variant<select value={stockVariantId} onChange={(event) => {
              const variantId = event.target.value;
              setStockVariantId(variantId);
              const variant = product.variants.find((item) => item.id === variantId);
              setStockQuantity(String(variant?.available || 0));
              setCodes("");
            }}>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label>}
            <label>Available quantity<input type="number" min="0" max="10000" step="1" required value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} /></label>
            {!product.variants.length && <label>New secret codes <span className="admin-help-text">Required only when increasing main-product quantity.</span><textarea rows={5} value={codes} onChange={(event) => setCodes(event.target.value)} placeholder="Required only when increasing quantity" /></label>}
            <button type="submit" className="admin-secondary">Save quantity</button>
          </form>}</section>
          <section className="admin-card"><h2>Product inventory</h2><div className="admin-product-list">{products.map((item) => <article className="admin-product-row" key={item.id}><div className="admin-product-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : (item.name?.trim()?.charAt(0).toUpperCase() || "P")}</div><div className="admin-product-info"><strong>{item.name}</strong><span>{item.category || "Other"} · {item.codeNumber} · {item.currency} {item.price} · {item.stockAvailable} available / {item.stockReserved || 0} reserved / {item.stockSold} sold</span>{item.variants?.map((variant) => <small key={variant._id}>{variant.name} · {item.currency} {variant.price} · {variant.stockQuantity ?? variant.codes.filter((code) => code.status === "available").length} available</small>)}<small>{item.active ? "Visible" : "Hidden"}{item.showInPopular ? ` · Popular #${item.popularOrder || 0}` : ""}</small></div><div className="admin-product-actions"><button type="button" className="admin-secondary" onClick={() => edit(item)}>Edit</button><button type="button" className="admin-delete" onClick={() => deleteProduct(item)}>Delete</button></div></article>)}{!products.length && <p className="admin-empty">No products yet.</p>}</div></section>
        </div>}
        {tab === "Orders" && <section className="admin-card"><h2>Orders</h2><OrderTable orders={orders} onMarkPaid={markPaid} onCancel={cancelOrder} /></section>}
        {tab === "Users" && <section className="admin-card"><h2>Users <small>({users.length})</small></h2><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Purchases</th><th>Paid total</th><th>Purchase history</th><th>Joined</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name || "—"}</td><td>{user.email}</td><td>{user.phone || "—"}</td><td>{user.orderCount}</td><td>{Object.entries(user.paidTotals || {}).length ? Object.entries(user.paidTotals).map(([currency, total]) => <small key={currency}>{currency} {Number(total).toFixed(2)}</small>) : "—"}</td><td><details className="admin-user-history"><summary>View {user.purchases?.length || 0}</summary><div>{user.purchases?.length ? user.purchases.map((purchase) => <article key={purchase.id}><strong>{purchase.productName}{purchase.variantName ? ` — ${purchase.variantName}` : ""} × {purchase.quantity}</strong><small>Invoice ID: {purchase.invoiceId || "—"}</small><span>{purchase.status} · {purchase.currency} {Number(purchase.amount).toFixed(2)}</span><time>{purchase.paidAt ? "Paid" : "Ordered"}: {new Date(purchase.paidAt || purchase.createdAt).toLocaleString()}</time></article>) : <p>No purchases yet.</p>}</div></details></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div></section>}
        {tab === "Reviews" && <section className="admin-card"><h2>Product comments <small>({reviews.length})</small></h2><div className="admin-review-list">{reviews.map((review) => <article className="admin-review-card" key={`${review.productId}:${review.id}`}><header><div><strong>{review.productName}</strong><span>{review.userName} · {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)} · ♥ {review.likeCount}</span></div><time>{review.createdAt ? new Date(review.createdAt).toLocaleString() : "—"}</time></header><p>{review.comment}</p><form className="admin-review-reply" onSubmit={(event) => saveReviewReply(event, review)}><label>Admin reply<textarea name="reply" rows={3} maxLength={1500} defaultValue={review.adminReply || ""} placeholder="Write a reply to this comment…" /></label><button type="submit" className="admin-secondary">Save reply</button><button type="button" className="admin-delete" onClick={() => deleteReview(review)}>Delete comment</button></form>{review.adminReply && <small className="admin-review-replied-by">Replied by {review.adminEmail || "admin"}{review.repliedAt ? ` · ${new Date(review.repliedAt).toLocaleString()}` : ""}</small>}</article>)}{!reviews.length && <p className="admin-empty">No product comments yet.</p>}</div></section>}
        {tab === "Product history" && <section className="admin-card"><h2>Product activity <small>({productActivity?.length || 0})</small></h2><p>Product add, edit, delete, stock renewal, and cancellation events, with the admin and exact time.</p><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Product</th><th>Action</th><th>Admin</th><th>Details</th><th>Date and time</th></tr></thead><tbody>{(productActivity || []).map((entry) => <tr key={entry._id}><td>{entry.productName}</td><td>{({ added: "Added", edited: "Edited", deleted: "Deleted", stock_renewed: "Stock renewed", codes_added: "Codes added", order_cancelled: "Order cancelled — stock returned" })[entry.action] || entry.action}</td><td>{entry.adminEmail}</td><td>{entry.details || "—"}</td><td>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</td></tr>)}</tbody></table>{!productActivity?.length && <p className="admin-empty">No product activity recorded yet.</p>}</div></section>}
        {tab === "Admins" && <section className="admin-card"><h2>Admin access</h2><p>Add an account email. That person will see the admin dashboard after signing in with the same email.</p><form className="admin-form admin-code-form" onSubmit={addAdmin}><label>Email address<input type="email" required maxLength={254} value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="admin@example.com" /></label><button type="submit" className="auth-submit">Add admin</button></form><div className="admin-product-list">{admins.map((admin) => <article className="admin-product-row" key={admin.id || admin.email}><div className="admin-product-info"><strong>{admin.email}</strong><span>{admin.source}{admin.addedAt ? ` · Added ${new Date(admin.addedAt).toLocaleDateString()}` : " · Set in backend environment"}</span></div>{admin.id && <button type="button" className="admin-delete" onClick={() => removeAdmin(admin)}>Remove</button>}</article>)}</div></section>}
      </>}
    </div>
  </main>;
}

function OrderTable({ orders, onMarkPaid, onCancel }) {
  const pendingAction = (order) => <div className="admin-order-actions"><button type="button" className="admin-confirm" onClick={() => onMarkPaid(order)}>Confirm paid</button>{onCancel && <button type="button" className="admin-cancel-order" onClick={() => onCancel(order)}>Cancel</button>}</div>;
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Qty</th><th>Amount</th><th>Status</th><th>Date</th><th>Action</th></tr></thead><tbody>{orders.map((order) => {
    const codes = order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : [];
    const statusLabel = order.status === "cancelled" ? "Cancelled — stock restored" : order.status === "pending" ? "Pending — reserved" : order.status;
    return <tr key={order._id}><td>#{String(order._id).slice(-7)}<small>{order.invoiceId}</small></td><td>{order.userName}<small>{order.userEmail}</small></td><td>{order.productName}<small>{order.variantName || order.codeNumber}</small></td><td>{order.quantity || 1}</td><td>{order.currency} {Number(order.amount).toFixed(2)}</td><td><span className={`order-status order-status-${order.status}`}>{statusLabel}</span></td><td>{new Date(order.createdAt).toLocaleString()}</td><td>{order.status === "pending" && onMarkPaid ? pendingAction(order) : <>{codes.map((code) => <code className="admin-delivered-code" key={code}>{code}</code>)}{order.status === "paid" && <button type="button" className="invoice-download" onClick={() => downloadInvoicePdf(order)}>Download invoice PDF</button>}</>}</td></tr>;
  })}</tbody></table>{!orders.length && <p className="admin-empty">No orders yet.</p>}</div>;
}
