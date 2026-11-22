"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function BetterAuthSignIn() {
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const credentials = { email: form.get("email"), password: form.get("password") };
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ ...credentials, name: form.get("name") })
        : await authClient.signIn.email(credentials);
      if (result.error) return setMessage(result.error.message || "Could not sign in.");
      if (!new URLSearchParams(window.location.search).has("oauth_query")) window.location.href = "/profile";
    } catch (error) {
      setMessage(error.message || "Could not reach the account server.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage("");
    const callbackURL = new URLSearchParams(window.location.search).has("oauth_query")
      ? window.location.href
      : `${window.location.origin}/profile`;
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL });
      if (result.error) setMessage(result.error.message || "Could not start Google sign-in.");
    } catch (error) {
      setMessage(error.message || "Could not start Google sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-page">
      <section className="profile-panel" aria-labelledby="better-auth-title">
        <span className="auth-kicker">IP DOKAN ACCOUNT</span>
        <h1 id="better-auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="profile-intro">Sign in or create an account to continue.</p>
        <div className="auth-mode-switch" role="tablist" aria-label="Account action">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "is-active" : ""} onClick={() => setMode("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>Sign up</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && <label>Name<input name="name" type="text" autoComplete="name" minLength={2} maxLength={80} required /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 10 : undefined} maxLength={128} required /></label>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="auth-google" type="button" disabled={busy} onClick={signInWithGoogle}>Continue with Google</button>
        {message && <p className="profile-message" role="status">{message}</p>}
      </section>
    </main>
  );
}
