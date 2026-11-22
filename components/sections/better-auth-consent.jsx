"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function BetterAuthConsent() {
  const params = useSearchParams();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function respond(accept) {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.oauth2.consent({ accept, scope: params.get("scope") || undefined });
      if (result.error) setMessage(result.error.message || "Could not update access approval.");
    } catch (error) {
      setMessage(error.message || "Could not reach the authorization server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-page">
      <section className="profile-panel" aria-labelledby="consent-title">
        <span className="auth-kicker">IP DOKAN AUTHORIZATION</span>
        <h1 id="consent-title">Allow this app?</h1>
        <p className="profile-intro">An app is requesting access to your IP Dokan account.</p>
        <dl className="consent-details">
          <dt>App</dt><dd>{params.get("client_id") || "Connected application"}</dd>
          <dt>Permissions</dt><dd>{(params.get("scope") || "profile").split(" ").join(", ")}</dd>
          {params.getAll("resource").map((resource) => <div className="consent-resource" key={resource}><dt>API</dt><dd>{resource}</dd></div>)}
        </dl>
        <div className="consent-actions">
          <button type="button" className="auth-submit" disabled={busy} onClick={() => respond(true)}>{busy ? "Please wait…" : "Allow access"}</button>
          <button type="button" className="profile-signout" disabled={busy} onClick={() => respond(false)}>Deny</button>
        </div>
        {message && <p className="profile-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
