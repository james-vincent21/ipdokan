"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const CHECK_MS = 60000;
// The admin panel fires this after switching dev mode, so the banner updates at once in that tab.
export const DEV_MODE_CHANGED = "ipdokan-dev-mode-changed";

// Large "Site under maintenance" banner on every page while an admin has dev mode on.
// Checked on load, every minute, and when the tab is shown again.
export function DevModeBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let active = true;
    const load = () => fetch(`${apiUrl}/api/site-status`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (active && result) setStatus(result.devMode); })
      .catch(() => {});
    load();
    const timer = window.setInterval(load, CHECK_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    const onChanged = (event) => setStatus(event.detail);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(DEV_MODE_CHANGED, onChanged);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(DEV_MODE_CHANGED, onChanged); };
  }, []);

  if (!status?.on) return null;
  return <div className="dev-mode-banner" role="status">
    <span className="dev-mode-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
    </span>
    <div>
      <strong>Site under maintenance</strong>
      <span>সাইটে কাজ চলছে। কিছু জিনিস ঠিকমতো কাজ নাও করতে পারে।</span>
      {status.message && <small>{status.message}</small>}
    </div>
  </div>;
}
