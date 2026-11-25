"use client";

import { useEffect, useState } from "react";
import { useErrorToast } from "@/lib/toast";

export const PAYMENT_METHOD_LABEL = { cryptomus: "Cryptomus", zinipay: "ZiniPay", wallet: "Wallet", stripe: "Card (Stripe)", demo: "Demo", admin: "Admin" };
const money = (amount, currency) => `${currency === "BDT" ? "৳" : "$"}${Number(amount || 0).toFixed(2)}`;
const STATUS = { pending: "Waiting for payment", completed: "Completed", failed: "Failed" };
const KIND = { topup: "Recharge", credit: "Credit by admin", debit: "Taken back by admin" };

// Admin Overview: latest wallet recharges (Cryptomus, ZiniPay) and manual credits, newest first.
export function AdminTopups({ api, refreshKey }) {
  const [topups, setTopups] = useState(null);
  const [error, setError] = useState("");
  useErrorToast(error);

  useEffect(() => {
    let active = true;
    api("/admin/wallet-topups").then((result) => { if (active) setTopups(result.topups || []); }).catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api, refreshKey]);

  return <section className="admin-card">
    <h2>Recent wallet recharges {topups && <small>({topups.length})</small>}</h2>
    {!topups ? <p className="admin-empty">Loading…</p> : !topups.length ? <p className="admin-empty">No wallet recharges yet.</p> : <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Customer</th><th>Type</th><th>Paid</th><th>Credited</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
      {topups.map((item) => <tr key={item.id}>
        <td>{item.userName || "—"}<small>{item.userEmail}</small></td>
        <td>{KIND[item.type] || item.type}{item.note && <small>{item.note}</small>}</td>
        <td>{item.type === "topup" ? money(item.paidAmount, item.paidCurrency) : "—"}</td>
        <td className={item.creditedUsd < 0 ? "admin-amount-negative" : undefined}>{item.creditedUsd < 0 ? "−" : "+"}{money(Math.abs(item.creditedUsd), "USD")}{item.bonusUsd > 0 && <small>incl. {money(item.bonusUsd, "USD")} bonus</small>}</td>
        <td><span className={`admin-pay-method is-${item.method}`}>{PAYMENT_METHOD_LABEL[item.method] || item.method}</span>{item.txid && <small className="admin-txid" title={item.txid}>Tx: {item.txid}</small>}{item.adminEmail && <small>{item.adminEmail}</small>}</td>
        <td><span className={`order-status order-status-${item.status === "completed" ? "paid" : item.status === "failed" ? "cancelled" : "pending"}`}>{STATUS[item.status] || item.status}</span></td>
        <td>{new Date(item.completedAt || item.createdAt).toLocaleString()}</td>
      </tr>)}
    </tbody></table></div>}
  </section>;
}
