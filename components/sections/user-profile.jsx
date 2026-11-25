"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloadInvoicePdf } from "@/lib/invoice-download";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function UserProfile() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const [copiedCode, setCopiedCode] = useState("");

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? "" : current)), 1800);
    } catch { setMessage("Copy failed. Select the code and copy it manually."); }
  }

  useEffect(() => {
    let active = true;
    let retryTimer;
    const searchParams = new URLSearchParams(window.location.search);
    const targetOrderIds = searchParams.get("orderIds")?.split(",").filter(Boolean) || [];
    const returnedFrom = ["zinipay", "cryptomus"].includes(searchParams.get("payment")) ? searchParams.get("payment") : "";
    async function loadOrders(attempt = 0) {
      try {
        // Ask the server to verify the payment with the gateway directly, in case its webhook has not arrived yet.
        if (returnedFrom && targetOrderIds.length && attempt < 30 && attempt % 3 === 0) {
          await fetch(`${apiUrl}/api/payments/${returnedFrom}/confirm`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: targetOrderIds }) }).catch(() => {});
        }
        const orderResponse = await fetch(`${apiUrl}/api/orders`, { credentials: "include", cache: "no-store" });
        if (!orderResponse.ok) return;
        const orderResult = await orderResponse.json();
        const nextOrders = orderResult.orders || [];
        if (!active) return;
        setOrders(nextOrders);
        const targetOrders = nextOrders.filter((order) => targetOrderIds.includes(String(order.id)));
        const paymentDelivered = targetOrderIds.length > 0 && targetOrders.length === targetOrderIds.length && targetOrders.every((order) => order.status === "paid");
        // Proxy orders: the provider can need a few minutes after payment, so keep checking until the IPs appear.
        const waitingForProxies = nextOrders.some((order) => order.isProxyOrder && (order.status === "processing" || (order.status === "paid" && order.deliveryPending)));
        if (targetOrderIds.length && !paymentDelivered && attempt < 30) retryTimer = window.setTimeout(() => loadOrders(attempt + 1), 1000);
        else if (waitingForProxies && attempt < 120) retryTimer = window.setTimeout(() => loadOrders(attempt + 1), 5000);
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
        fetch(`${apiUrl}/api/wallet`, { credentials: "include", cache: "no-store" }).then((walletResponse) => walletResponse.ok ? walletResponse.json() : null).then((walletResult) => { if (active && walletResult) setWallet(walletResult); }).catch(() => {});
      })
      .catch((error) => { if (active) { setMessage(error.message); setStatus("error"); } });
    return () => { active = false; window.clearTimeout(retryTimer); };
  }, []);

  const codesOf = (order) => (order.deliveredCodes?.length ? order.deliveredCodes : order.deliveredCode ? [order.deliveredCode] : []);
  const paidOrders = orders.filter((order) => order.status === "paid");
  const stats = [
    ["Orders", orders.length],
    ["Completed", paidOrders.length],
    ["Codes received", paidOrders.reduce((sum, order) => sum + codesOf(order).length, 0)],
  ];
  const statusLabel = (order) => order.status === "pending" ? "Awaiting payment" : order.status === "processing" ? "Processing" : order.status === "cancelled" ? "Cancelled" : "Paid";

  return (
    <main className="profile-page">
      <div className="profile-shell">
        {status === "loading" && <section className="profile-card profile-state" aria-busy="true"><span className="profile-spinner" aria-hidden="true" /><p className="profile-message">Loading your profile…</p></section>}
        {status === "error" && <section className="profile-card profile-state"><p className="profile-message" role="status">{message}</p><Link className="profile-home-link" href="/">Return to sign in</Link></section>}
        {status === "ready" && <>
          <section className="profile-card profile-hero" aria-labelledby="profile-title">
            <div className="profile-identity">
              {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{(user.name || user.email || "U").slice(0, 1).toUpperCase()}</span>}
              <div>
                <span className="auth-kicker">MY ACCOUNT</span>
                <h1 id="profile-title">{user.name || "Your profile"}</h1>
                <p>{user.email}</p>
              </div>
            </div>
            <dl className="profile-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </section>

          {wallet && <section className="profile-card profile-wallet-card" aria-label="Wallet balance">
            <div><span className="auth-kicker">WALLET BALANCE</span><strong>${Number(wallet.balanceUsd).toFixed(2)}</strong><small>≈ ৳{Number(wallet.balanceBdt).toLocaleString("en-US", { maximumFractionDigits: 2 })}</small></div>
            <a className="auth-submit profile-wallet-link" href="/wallet">Recharge / history</a>
          </section>}

          {message && <p className="profile-notice" role="status">{message}</p>}

          <section className="profile-card profile-orders" aria-labelledby="profile-orders-title">
            <header className="profile-section-head"><h2 id="profile-orders-title">Purchase history</h2>{orders.length > 0 && <span>{orders.length} order{orders.length === 1 ? "" : "s"}</span>}</header>
            {orders.length ? <div className="profile-order-list">{orders.map((order) => {
              const codes = codesOf(order);
              return <article className={`profile-order is-${order.status}`} key={order.id}>
                <header className="profile-order-head">
                  <div>
                    <strong>{order.productName}{order.variantName ? <em> · {order.variantName}</em> : null}</strong>
                    <span>{new Date(order.createdAt).toLocaleString()}{order.quantity > 1 ? ` · Qty ${order.quantity}` : ""}</span>
                  </div>
                  <span className={`order-status order-status-${order.status}`}>{statusLabel(order)}</span>
                </header>
                <div className="profile-order-meta">
                  <span>Invoice <b>{order.invoiceId || `IPD-${String(order.id).toUpperCase()}`}</b></span>
                  {order.amount !== undefined && <span>Total <b>{order.currency} {Number(order.amount).toFixed(2)}</b></span>}
                </div>
                {codes.length > 0 && <div className="profile-codes">
                  <span className="profile-codes-label">{order.isProxyOrder ? (codes.length === 1 ? "Your proxy" : `Your ${codes.length} proxies`) : codes.length === 1 ? "Your code" : `Your ${codes.length} codes`}</span>
                  {codes.map((code) => <div className="profile-code" key={code}><code>{code}</code><button type="button" onClick={() => copyCode(code)} aria-label={`Copy code ${code}`}>{copiedCode === code ? "Copied" : "Copy"}</button></div>)}
                </div>}
                {order.status === "pending" && <p className="profile-order-hint">{order.isProxyOrder ? "After payment is confirmed, your proxy is prepared automatically and arrives within 3–5 minutes." : "Your codes will appear here as soon as payment is confirmed."}</p>}
                {order.isProxyOrder && order.status === "processing" && <p className="profile-order-hint profile-order-wait">Payment received. Your proxy is being prepared. Please be patient, it will arrive within 3–5 minutes. This page updates by itself.</p>}
                {order.isProxyOrder && order.status === "paid" && order.deliveryPending && <p className="profile-order-hint profile-order-wait">Payment received. Your proxy is being prepared. Please be patient, it will arrive within 3–5 minutes. This page updates by itself.</p>}
                {order.isProxyOrder && order.status === "paid" && !order.deliveryPending && <p className="profile-order-hint">Format: IP:port:username:password. The IP address you ordered from is also whitelisted, so it can connect without a password.</p>}
                {order.status === "paid" && <footer><button type="button" className="invoice-download" onClick={() => { if (!downloadInvoicePdf(order, user)) setMessage("Allow pop-ups to download your invoice as a PDF."); }}>Download invoice PDF</button></footer>}
              </article>;
            })}</div> : <div className="profile-empty-orders"><strong>No purchases yet</strong><p>Products you buy will show up here with their codes and invoices.</p><Link className="profile-home-link" href="/catalog">Browse products</Link></div>}
          </section>
        </>}
      </div>
    </main>
  );
}
