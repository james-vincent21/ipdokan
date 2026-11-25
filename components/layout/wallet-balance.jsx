"use client";

import { useEffect, useState } from "react";
import { NOTIFICATION_EVENT } from "@/lib/realtime-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
// Other parts of the site can fire this after spending from the wallet, to refresh the header.
export const WALLET_CHANGED = "ipdokan-wallet-changed";

const format = (amount, currency) => (currency === "BDT" ? `৳${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${Number(amount).toFixed(2)}`);

// Wallet balance shown next to "Wallet" in the header, in the visitor's chosen display currency.
// Refreshed when a notification arrives (recharge, refund, credit, paid order) and when the tab is shown again.
export function WalletBalance({ signedIn, currency }) {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const load = () => fetch(`${apiUrl}/api/wallet/balance`, { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (active && result) setBalance(result); })
      .catch(() => {});
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener(NOTIFICATION_EVENT, load);
    window.addEventListener(WALLET_CHANGED, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.removeEventListener(NOTIFICATION_EVENT, load); window.removeEventListener(WALLET_CHANGED, load); document.removeEventListener("visibilitychange", onVisible); };
  }, [signedIn]);

  if (!signedIn || !balance) return null;
  const amount = currency === "BDT" ? balance.balanceBdt : balance.balanceUsd;
  return <span className="wallet-nav-balance" aria-label={`Balance ${format(amount, currency)}`}>{format(amount, currency)}</span>;
}
