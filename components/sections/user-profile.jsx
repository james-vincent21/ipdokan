"use client";

import { useEffect, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-download";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function UserProfile() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let retryTimer;
    const targetOrderIds = new URLSearchParams(window.location.search).get("orderIds")?.split(",").filter(Boolean) || [];
    async function loadOrders(attempt = 0) {
      try {
        const orderResponse = await fetch(`${apiUrl}/api/orders`, { credentials: "include", cache: "no-store" });
        if (!orderResponse.ok) return;
        const orderResult = await orderResponse.json();
        const nextOrders = orderResult.orders || [];
        if (!active) return;
        setOrders(nextOrders);
        const targetOrders = nextOrders.filter((order) => targetOrderIds.includes(String(order.id)));
        const paymentDelivered = targetOrderIds.length > 0 && targetOrders.length === targetOrderIds.length && targetOrders.every((order) => order.status === "paid");
        if (targetOrderIds.length && !paymentDelivered && attempt < 30) retryTimer = window.setTimeout(() => loadOrders(attempt + 1), 1000);
      } catch { /* Keep the profile visible if order history is temporarily unavailable. */ }
    }
    fetch(`${apiUrl}/api/profile`, { credentials: "include" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load your profile.");
        const adminResponse = await fetch(`${apiUrl}/api/admin/access`, { credentials: "include" });
        if (adminResponse.ok) {
          window.location.replace("/admin");
          return;
        }
        if (!active) return;
        setUser(result.user);
        setStatus("ready");
        loadOrders();
      })
      .catch((error) => { if (active) { setMessage(error.message); setStatus("error"); } });
    return () => { active = false; window.clearTimeout(retryTimer); };
  }, []);

  return (
    <main className="profile-page">
      <section className="profile-panel profile-panel-simple" aria-labelledby="profile-title">
        {status === "loading" && <p className="profile-message">Loading your profile…</p>}
        {status === "error" && <><p className="profile-message" role="status">{message}</p><a className="profile-home-link" href="/">Return to sign in</a></>}
        {status === "ready" && <>
          <span className="auth-kicker">MY ACCOUNT</span>
          <h1 id="profile-title">Your profile</h1>
          <div className="profile-identity">
            {user.image ? <img src={user.image} alt="" /> : <span aria-hidden="true">{(user.name || user.email || "U").slice(0, 1).toUpperCase()}</span>}
            <div><strong>{user.name}</strong><span>{user.email}</span></div>
          </div>
          <section className="profile-orders-section profile-orders" aria-labelledby="profile-orders-title">
            <h2 id="profile-orders-title">Purchase history</h2>
            {orders.length ? <div className="profile-order-list">{orders.map((order) => <article className="profile-order" key={order.id}>
              <div><strong>{order.productName}{order.variantName ? ` — ${order.variantName}` : ""}{order.quantity > 1 ? ` × ${order.quantity}` : ""}</strong><span>{order.codeNumber} · {new Date(order.createdAt).toLocaleString()}</span><span>Invoice ID: {order.invoiceId || `IPD-${String(order.id).toUpperCase()}`}</span></div>
              <span className={`order-status order-status-${order.status}`}>{order.status === "pending" ? "Reserved — awaiting payment" : order.status === "cancelled" ? "Cancelled — stock restored" : order.status}</span>
              {(order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : []).map((code) => <code className="delivered-code" key={code}>{code}</code>)}
              {order.status === "paid" && <button type="button" className="invoice-download" onClick={() => { if (!downloadInvoicePdf(order, user)) setMessage("Allow pop-ups to download your invoice as a PDF."); }}>Download invoice PDF</button>}
            </article>)}</div> : <p className="profile-empty-orders">No purchases yet.</p>}
          </section>
        </>}
      </section>
    </main>
  );
}
