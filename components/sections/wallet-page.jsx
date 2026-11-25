"use client";

import { useCallback, useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const QUICK_AMOUNTS = { USD: [5, 10, 40, 100], BDT: [500, 1000, 5000, 10000] };
const METHOD_LABEL = { zinipay: "ZiniPay", cryptomus: "Cryptomus", wallet: "Wallet" };

function money(amount, currency) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: currency === "BDT" ? 0 : 2, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

// Same rounding as the server: BDT is converted to USD and rounded down to the cent.
const bdtToUsd = (bdt, rate) => Math.floor((Number(bdt) / rate) * 100 + 1e-9) / 100;

function describe(transaction) {
  if (transaction.type === "topup") return { title: transaction.bonusUsd > 0 ? "Recharge + bonus" : "Recharge", detail: `Paid ${money(transaction.paidAmount, transaction.paidCurrency)} via ${METHOD_LABEL[transaction.method] || transaction.method}${transaction.paidCurrency === "BDT" ? ` · 1 USD = ৳${transaction.bdtPerUsd}` : ""}${transaction.bonusUsd > 0 ? ` · includes ${money(transaction.bonusUsd, "USD")} bonus` : ""}` };
  if (transaction.type === "purchase") return { title: "Purchase", detail: `${transaction.orderCount} order${transaction.orderCount === 1 ? "" : "s"} paid from wallet` };
  if (transaction.type === "credit") return { title: "Credit from IP DOKAN", detail: transaction.note || "Added to your wallet by the store" };
  if (transaction.type === "debit") return { title: "Credit taken back", detail: transaction.note || "Taken back by the store" };
  return { title: "Refund", detail: transaction.note || "Returned to your wallet" };
}

const statusText = { pending: "Waiting for payment", completed: "Completed", failed: "Failed" };

export function WalletPage() {
  const [state, setState] = useState("loading");
  const [wallet, setWallet] = useState(null);
  const [currency, setCurrency] = useState("BDT");
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Reads the wallet; the caller applies the result (null = signed out).
  const fetchWallet = useCallback(async () => {
    const response = await fetch(`${apiUrl}/api/wallet`, { credentials: "include", cache: "no-store" });
    if (response.status === 401) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load your wallet.");
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    let timer;
    const params = new URLSearchParams(window.location.search);
    const topupId = params.get("topup");
    const cancelled = params.get("payment") === "cancelled";
    // Back from the payment page: ask the server to check the payment, and keep checking while it is pending.
    async function confirm(attempt = 0) {
      try {
        const response = await fetch(`${apiUrl}/api/wallet/topups/${encodeURIComponent(topupId)}/confirm`, { method: "POST", credentials: "include" });
        const result = await response.json();
        if (!active || !response.ok) return;
        const { status, amountUsd } = result.transaction;
        if (status === "completed") { setNotice(`Recharge successful: ${money(amountUsd, "USD")} was added to your wallet.`); await reload(); return; }
        if (status === "failed") { setNotice("The recharge was not completed. No money was added."); await reload(); return; }
        if (cancelled) { setNotice("Recharge cancelled. No money was added."); return; }
        setNotice("Checking your payment… your balance updates by itself once it is confirmed.");
        if (attempt < 40) timer = window.setTimeout(() => confirm(attempt + 1), attempt < 10 ? 3000 : 10000);
        else setNotice("Your payment is still being confirmed. Crypto payments can take a while; the balance updates once it arrives.");
      } catch { /* The balance below still loads. */ }
    }
    async function reload() {
      const result = await fetchWallet();
      if (!active) return null;
      if (!result) { setState("signed-out"); return null; }
      setWallet(result);
      setState("ready");
      return result;
    }
    (async () => {
      try {
        const result = await reload();
        if (result && topupId && active) confirm();
      } catch (loadError) { if (active) { setError(loadError.message); setState("error"); } }
    })();
    return () => { active = false; window.clearTimeout(timer); };
  }, [fetchWallet]);

  const rate = wallet?.bdtPerUsd || 135;
  const min = wallet?.minTopup?.[currency] ?? (currency === "BDT" ? 100 : 0.75);
  const max = wallet?.maxTopup?.[currency] ?? (currency === "BDT" ? 500000 : 5000);
  const value = Number(amount);
  const creditUsd = currency === "BDT" ? bdtToUsd(value, rate) : value;
  // Same rule as the server: recharges at or above the threshold get `percent` extra, rounded down to the cent.
  const bonusRule = wallet?.bonus;
  const bonusUsd = bonusRule?.percent > 0 && value + 1e-9 >= bonusRule.threshold[currency] ? Math.floor(Math.round(creditUsd * 100) * bonusRule.percent / 100 + 1e-9) / 100 : 0;
  const totalUsd = Math.round((creditUsd + bonusUsd) * 100) / 100;
  const methodReady = Boolean(wallet?.methods?.[currency]);
  const amountError = !amount ? "Enter an amount." : !Number.isFinite(value) ? "Enter a number." : value < min ? `Minimum ${money(min, currency)}.` : value > max ? `Maximum ${money(max, currency)} at a time.` : currency === "BDT" && !Number.isInteger(value) ? "Enter whole taka." : "";

  function switchCurrency(next) {
    setCurrency(next);
    setAmount(String(QUICK_AMOUNTS[next][0]));
    setError("");
  }

  async function recharge(event) {
    event.preventDefault();
    if (amountError) return setError(amountError);
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/wallet/topups`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currency, amount: value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not start the recharge.");
      window.location.assign(result.url);
    } catch (rechargeError) { setError(rechargeError.message); setBusy(false); }
  }

  return <main className="profile-page wallet-page">
    <div className="profile-shell">
      {state === "loading" && <section className="profile-card profile-state" aria-busy="true"><span className="profile-spinner" aria-hidden="true" /><p className="profile-message">Loading your wallet…</p></section>}
      {state === "signed-out" && <section className="profile-card profile-state"><p className="profile-message">Sign in to see and recharge your wallet.</p><a className="profile-home-link" href="/sign-in">Sign in</a></section>}
      {state === "error" && <section className="profile-card profile-state"><p className="profile-message" role="alert">{error}</p></section>}
      {state === "ready" && wallet && <>
        <section className="profile-card wallet-balance-card" aria-labelledby="wallet-title">
          <span className="auth-kicker">MY WALLET</span>
          <h1 id="wallet-title" className="wallet-balance">{money(wallet.balanceUsd, "USD")}</h1>
          <p className="wallet-balance-bdt">≈ {money(wallet.balanceBdt, "BDT")} <small>· 1 USD = ৳{rate}</small></p>
          <p className="wallet-balance-note">Use your balance to pay at checkout: choose <b>Pay from wallet</b>.</p>
        </section>

        {notice && <p className="profile-notice" role="status">{notice}</p>}

        <section className="profile-card" aria-labelledby="wallet-recharge-title">
          <header className="profile-section-head"><h2 id="wallet-recharge-title">Recharge wallet</h2></header>
          <form className="wallet-recharge" onSubmit={recharge}>
            <div className="wallet-currency" role="group" aria-label="Recharge currency">
              <button type="button" className={currency === "BDT" ? "is-selected" : ""} aria-pressed={currency === "BDT"} onClick={() => switchCurrency("BDT")}><strong>BDT ৳</strong><small>bKash, Nagad, Rocket via ZiniPay</small></button>
              <button type="button" className={currency === "USD" ? "is-selected" : ""} aria-pressed={currency === "USD"} onClick={() => switchCurrency("USD")}><strong>USD $</strong><small>USDT, BTC, ETH via Cryptomus</small></button>
            </div>
            <label className="wallet-amount"><span>Amount in {currency}</span>
              <div><b aria-hidden="true">{currency === "BDT" ? "৳" : "$"}</b><input type="number" inputMode="decimal" min={min} max={max} step={currency === "BDT" ? 1 : 0.01} value={amount} onChange={(event) => { setAmount(event.target.value); setError(""); }} /></div>
            </label>
            <div className="wallet-quick">{QUICK_AMOUNTS[currency].map((quick) => <button type="button" key={quick} className={value === quick ? "is-selected" : ""} onClick={() => { setAmount(String(quick)); setError(""); }}>{money(quick, currency)}</button>)}</div>
            {bonusRule?.percent > 0 && <p className={`wallet-bonus-banner${bonusUsd > 0 ? " is-active" : ""}`}>🎁 {bonusUsd > 0 ? `You get ${bonusRule.percent}% extra on this recharge!` : `Recharge ${money(bonusRule.threshold.BDT, "BDT")} (${money(bonusRule.threshold.USD, "USD")}) or more and get ${bonusRule.percent}% extra in your wallet.`}</p>}
            <div className="wallet-preview" aria-live="polite">
              <p><span>You pay</span><strong>{amountError ? "—" : money(value, currency)}</strong></p>
              {bonusUsd > 0 && !amountError && <>
                <p><span>Recharge value</span><strong>{money(creditUsd, "USD")}</strong></p>
                <p className="wallet-bonus-line"><span>Bonus ({bonusRule.percent}% extra)</span><strong>+{money(bonusUsd, "USD")}</strong></p>
              </>}
              <p><span>Added to your wallet</span><strong className="wallet-credit">{amountError ? "—" : money(totalUsd, "USD")}</strong></p>
              {!amountError && <small>{currency === "BDT" ? `${money(value, "BDT")} ÷ ${rate} = ${money(creditUsd, "USD")}` : `≈ ${money(Math.round(value * rate * 100) / 100, "BDT")} at 1 USD = ৳${rate}`}</small>}
            </div>
            {(error || amountError) && <p className="admin-image-error" role="alert">{error || amountError}</p>}
            <button className="auth-submit" type="submit" disabled={busy || Boolean(amountError) || !methodReady}>{!methodReady ? `${currency} recharge is not available right now` : busy ? "Taking you to the payment page…" : `Recharge with ${currency === "BDT" ? "ZiniPay" : "Cryptomus"}`}</button>
            <p className="wallet-fine-print">Minimum {money(wallet.minTopup.BDT, "BDT")} ({money(wallet.minTopup.USD, "USD")}). No fee on recharge; the {currency === "BDT" ? "taka" : "dollar"} amount you pay is added in USD{bonusRule?.percent > 0 ? `, plus ${bonusRule.percent}% extra from ${money(bonusRule.threshold.BDT, "BDT")} (${money(bonusRule.threshold.USD, "USD")})` : ""}. The 5% service fee applies when you buy.</p>
          </form>
        </section>

        <section className="profile-card" aria-labelledby="wallet-history-title">
          <header className="profile-section-head"><h2 id="wallet-history-title">Wallet history</h2>{wallet.transactions.length > 0 && <span>{wallet.transactions.length} entr{wallet.transactions.length === 1 ? "y" : "ies"}</span>}</header>
          {wallet.transactions.length ? <ul className="wallet-history">{wallet.transactions.map((transaction) => {
            const info = describe(transaction);
            return <li key={transaction.id} className={`is-${transaction.status}`}>
              <div><strong>{info.title}</strong><small>{info.detail}</small><time>{new Date(transaction.createdAt).toLocaleString()}</time></div>
              <div className="wallet-history-amount">
                <strong className={transaction.amountUsd >= 0 ? "is-credit" : "is-debit"}>{transaction.amountUsd >= 0 ? "+" : "−"}{money(Math.abs(transaction.amountUsd), "USD")}</strong>
                <small>{transaction.status === "completed" && transaction.balanceAfterUsd !== null ? `Balance ${money(transaction.balanceAfterUsd, "USD")}` : statusText[transaction.status]}</small>
              </div>
            </li>;
          })}</ul> : <p className="checkout-empty">No wallet activity yet. Recharge to get started.</p>}
        </section>
      </>}
    </div>
  </main>;
}
