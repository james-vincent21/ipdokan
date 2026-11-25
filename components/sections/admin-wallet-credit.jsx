"use client";

import { useImperativeHandle, useState } from "react";

const usd = (amount) => `$${Number(amount || 0).toFixed(2)}`;

// Admin: find a verified customer by user id and add money to their wallet by hand.
// `ref.current.pick(id)` is called when the admin presses "Credit" on a row of the user list.
export function AdminWalletCredit({ api, onCredited, ref }) {
  const [userId, setUserId] = useState("");
  const [found, setFound] = useState(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function lookup(id) {
    const cleanId = String(id || "").trim();
    if (!cleanId) return;
    setBusy(true); setError(""); setMessage(""); setFound(null);
    try { setFound((await api(`/admin/users/${encodeURIComponent(cleanId)}/lookup`)).user); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  useImperativeHandle(ref, () => ({ pick(id) { setUserId(id); lookup(id); } }));

  async function credit(event) {
    event.preventDefault();
    if (!found) return;
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount more than zero.");
    const shown = currency === "BDT" ? `৳${value.toFixed(2)} (converted to USD)` : usd(value);
    if (!window.confirm(`Add ${shown} to the wallet of ${found.email}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(`/admin/users/${found.id}/wallet-credit`, { method: "POST", body: JSON.stringify({ amount: value, currency, note }) });
      setFound({ ...found, walletBalanceUsd: result.walletBalanceUsd });
      setMessage(`${usd(result.creditedUsd)} added to ${found.email}. New balance: ${usd(result.walletBalanceUsd)}.`);
      setAmount(""); setNote("");
      onCredited?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <section className="admin-card admin-wallet-credit">
    <h2>Add wallet credit</h2>
    <p>Find a verified user by their user id, then add money to their wallet. The user gets a notification and sees it in their wallet history.</p>
    <form className="admin-form admin-code-form" onSubmit={(event) => { event.preventDefault(); lookup(userId); }}>
      <label>User id<input required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="e.g. 6650c2f1a4b3e2d1c0f9e8d7" spellCheck={false} /></label>
      <button type="submit" className="auth-submit" disabled={busy}>{busy && !found ? "Finding…" : "Find user"}</button>
    </form>
    {error && <p className="admin-notice is-error" role="alert">{error}</p>}
    {message && <p className="admin-notice" role="status">{message}</p>}
    {found && <div className="admin-credit-user">
      <div><strong>{found.name || "—"}</strong><span>{found.email}{found.phone ? ` · ${found.phone}` : ""}</span><small>Wallet balance: {usd(found.walletBalanceUsd)}{found.banned ? " · Banned" : ""}</small></div>
      <form className="admin-form admin-credit-form" onSubmit={credit}>
        <label>Amount<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD</option><option value="BDT">BDT (converted to USD)</option></select></label>
        <label>Note (shown to the user)<input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Manual bKash payment" /></label>
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Adding…" : "Add credit"}</button>
      </form>
    </div>}
  </section>;
}
