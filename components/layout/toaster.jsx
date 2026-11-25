"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_EVENT } from "@/lib/toast";

const DURATION = { error: 7000, success: 4500, info: 4500 };
const MAX_TOASTS = 4;

// Shows toasts sent with toast.error / toast.success / toast.info (lib/toast.js), top centre of the screen.
export function Toaster() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  useEffect(() => {
    const active = timers.current;
    const onToast = (event) => {
      const item = event.detail;
      // The same message shown twice in a row replaces the first one instead of stacking.
      setToasts((current) => [...current.filter((entry) => entry.message !== item.message), item].slice(-MAX_TOASTS));
      active.set(item.id, window.setTimeout(() => dismiss(item.id), item.duration || DURATION[item.type] || 5000));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => { window.removeEventListener(TOAST_EVENT, onToast); active.forEach((timer) => window.clearTimeout(timer)); active.clear(); };
  }, [dismiss]);

  return <div className="app-toasts" aria-live="assertive" aria-atomic="false">
    {toasts.map((item) => <div key={item.id} className={`app-toast is-${item.type}`} role={item.type === "error" ? "alert" : "status"}>
      <span className="app-toast-icon" aria-hidden="true">{item.type === "error" ? "!" : item.type === "success" ? "✓" : "i"}</span>
      <p>{item.message}{item.action && <> <a href={item.action.href}>{item.action.label}</a></>}</p>
      <button type="button" aria-label="Close" onClick={() => dismiss(item.id)}>×</button>
    </div>)}
  </div>;
}
