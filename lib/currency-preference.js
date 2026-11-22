"use client";

import { useEffect, useState } from "react";

const storageKey = "ipdokan-currency-v1";
const eventName = "ipdokan:currency-change";
const validCurrency = (value) => value === "USD" || value === "BDT" ? value : "BDT";

export function useCurrencyPreference() {
  const [currency, setCurrency] = useState("BDT");

  useEffect(() => {
    try { setCurrency(validCurrency(window.localStorage.getItem(storageKey))); }
    catch { setCurrency("BDT"); }
    const onCurrencyChange = (event) => setCurrency(validCurrency(event.detail));
    const onStorage = (event) => { if (event.key === storageKey) setCurrency(validCurrency(event.newValue)); };
    window.addEventListener(eventName, onCurrencyChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(eventName, onCurrencyChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function chooseCurrency(value) {
    const nextCurrency = validCurrency(value);
    setCurrency(nextCurrency);
    try { window.localStorage.setItem(storageKey, nextCurrency); } catch { /* Keep the selection for this page. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: nextCurrency }));
  }

  return [currency, chooseCurrency];
}
