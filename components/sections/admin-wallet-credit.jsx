"use client";

import { useImperativeHandle, useState } from "react";
import { useErrorToast } from "@/lib/toast";

const usd = (amount) => `$${Number(amount || 0).toFixed(2)}`;

// Admin: find a verified customer by user id, name or email, then add money to their wallet or take it back.
// `ref.current.pick(id)` is called when the admin presses "Credit" on a row of the user list.
export function AdminWalletCredit({ api, onCredited, ref }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [found, setFound] = useState(null);
  const [mode, setMode] = useState("credit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [message, setMessage] = useState("");

  async function lookupId(id) {
    setBusy(true); setError(""); setMessage(""); setFound(null); setResults(null);
    try { setFound((await api(`/admin/users/${encodeURIComponent(id)}/lookup`)).user); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function search(event) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) return setError("Type at least 2 characters of a user id, name or email.");
    setBusy(true); setError(""); setMessage(""); setFound(null); setResults(null);
    try {
      const list = (await api(`/admin/users/search?q=${encodeURIComponent(text)}`)).users || [];
      if (list.length === 1) setFound(list[0]);
      else if (!list.length) setError("No verified user matches this id, name or email.");
      else setResults(list);
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  useImperativeHandle(ref, () => ({ pick(id) { setQuery(id); lookupId(id); } }));

  async function submit(event) {
    event.preventDefault();
    if (!found) return;
    const value = Number(amount);
    if (!(value > 0)) return setError("Enter an amount more than zero.");
    const shown = currency === "BDT" ? `৳${value.toFixed(2)} (converted to USD)` : usd(value);
    const taking = mode === "debit";
    if (!window.confirm(taking ? `Take back ${shown} from the wallet of ${found.email}?` : `Add ${shown} to the wallet of ${found.email}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(`/admin/users/${found.id}/${taking ? "wallet-debit" : "wallet-credit"}`, { method: "POST", body: JSON.stringify({ amount: value, currency, note }) });
      setFound({ ...found, walletBalanceUsd: result.walletBalanceUsd });
      setMessage(taking
        ? `${usd(result.debitedUsd)} taken back from ${found.email}. New balance: ${usd(result.walletBalanceUsd)}.`
        : `${usd(result.creditedUsd)} added to ${found.email}. New balance: ${usd(result.walletBalanceUsd)}.`);
      setAmount(""); setNote("");
      onCredited?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <section className="admin-card admin-wallet-credit">
    <h2>Wallet credit</h2>
    <p>Find a verified user by user id, name or email. Then add money to their wallet, or take back credit (never more than their balance). The user gets a notification and sees it in their wallet history.</p>
    <form className="admin-form admin-code-form" onSubmit={search}>
      <label>User id, name or email<input required value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. rahim, rahim@gmail.com or a user id" spellCheck={false} /></label>
      <button type="submit" className="auth-submit" disabled={busy}>{busy && !found ? "Searching…" : "Find user"}</button>
    </form>
    {message && <p className="admin-notice" role="status">{message}</p>}
    {results && <ul className="admin-credit-results" aria-label="Matching users">{results.map((user) => <li key={user.id}>
      <button type="button" onClick={() => { setFound(user); setResults(null); setMessage(""); }}><strong>{user.name || "—"} · {user.email}</strong><small>{user.id} · Balance {usd(user.walletBalanceUsd)}{user.banned ? " · Banned" : ""}</small></button>
    </li>)}</ul>}
    {found && <div className="admin-credit-user">
      <div><strong>{found.name || "—"}</strong><span>{found.email}{found.phone ? ` · ${found.phone}` : ""}</span><small>User id: {found.id} · Wallet balance: {usd(found.walletBalanceUsd)}{found.banned ? " · Banned" : ""}</small></div>
      <div className="admin-credit-mode" role="tablist" aria-label="Credit action">
        <button type="button" role="tab" aria-selected={mode === "credit"} className={mode === "credit" ? "is-selected" : ""} onClick={() => setMode("credit")}>Add credit</button>
        <button type="button" role="tab" aria-selected={mode === "debit"} className={mode === "debit" ? "is-selected is-debit" : ""} onClick={() => setMode("debit")}>Take back credit</button>
      </div>
      <form className="admin-form admin-credit-form" onSubmit={submit}>
        <label>Amount<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD</option><option value="BDT">BDT (converted to USD)</option></select></label>
        <label>Note (shown to the user)<input maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder={mode === "debit" ? "e.g. Credit added by mistake" : "e.g. Manual bKash payment"} /></label>
        <button type="submit" className={mode === "debit" ? "auth-submit admin-danger" : "auth-submit"} disabled={busy}>{busy ? "Saving…" : mode === "debit" ? "Take back credit" : "Add credit"}</button>
      </form>
    </div>}
  </section>;
}
