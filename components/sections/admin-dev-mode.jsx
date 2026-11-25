"use client";

import { useEffect, useState } from "react";
import { DEV_MODE_CHANGED } from "@/components/layout/dev-mode-banner";

// Admin switch for dev mode: while on, every page shows a large "Site under maintenance" banner.
export function AdminDevMode({ api }) {
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api("/admin/site-status")
      .then((result) => { if (active) { setStatus(result.devMode); setMessage(result.devMode.message || ""); } })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api]);

  async function save(on) {
    if (on && !status?.on && !window.confirm("Turn on dev mode? Every visitor will see a large \"Site under maintenance\" banner until you turn it off.")) return;
    setBusy(true); setError("");
    try {
      const result = await api("/admin/site-status/dev-mode", { method: "PUT", body: JSON.stringify({ on, message }) });
      setStatus(result.devMode);
      window.dispatchEvent(new CustomEvent(DEV_MODE_CHANGED, { detail: { on: result.devMode.on, message: result.devMode.message } }));
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  const on = Boolean(status?.on);
  return <section className={`admin-card admin-dev-mode${on ? " is-on" : ""}`}>
    <div className="admin-dev-mode-head">
      <div>
        <h2>Dev mode {status && <span className={`user-status${on ? " is-banned" : ""}`}>{on ? "ON" : "Off"}</span>}</h2>
        <p>While dev mode is on, every page shows a large &quot;Site under maintenance&quot; banner. The site keeps working.{on && status.updatedBy ? ` Turned on by ${status.updatedBy}${status.updatedAt ? `, ${new Date(status.updatedAt).toLocaleString()}` : ""}.` : ""}</p>
      </div>
      <button type="button" className={on ? "auth-submit" : "auth-submit admin-danger"} disabled={busy || !status} onClick={() => save(!on)}>{busy ? "Saving…" : on ? "Turn dev mode off" : "Turn dev mode on"}</button>
    </div>
    <form className="admin-form admin-code-form" onSubmit={(event) => { event.preventDefault(); save(on); }}>
      <label>Extra message on the banner (optional)<input maxLength={300} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. Payments are paused until 6 PM" /></label>
      {on && <button type="submit" className="admin-secondary" disabled={busy}>Update message</button>}
    </form>
    {error && <p className="admin-notice is-error" role="alert">{error}</p>}
  </section>;
}
