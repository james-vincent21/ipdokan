"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

const RESEND_AFTER = 60; // seconds; the server also allows only 3 codes a minute

// Second step of an email sign-up (or of signing in to an account that was never verified): the 6-digit
// code sent to the email address. A correct code verifies the address and signs the person in.
export function EmailOtpStep({ email, onDone, onBack }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    if (!wait) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);

  async function verify(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp: code });
      if (result.error) {
        setMessage(result.error.code === "TOO_MANY_ATTEMPTS" ? "Too many wrong codes. Send a new code and try again." : result.error.message || "That code is not right.");
        return;
      }
      onDone();
    } catch (error) {
      setMessage(error.message || "Could not reach the account server.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      if (result.error) return setMessage(result.error.message || "Could not send a new code.");
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
      setMessage("A new code is on its way.");
    } catch (error) {
      setMessage(error.message || "Could not reach the account server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-otp">
      <p className="auth-otp-intro">We sent a 6-digit code to <strong>{email}</strong>. It expires in 5 minutes. Check your spam folder if you don&apos;t see it.</p>
      <form className="auth-form" onSubmit={verify}>
        <label>Verification code
          <input className="auth-otp-input" name="otp" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" minLength={6} maxLength={6} placeholder="••••••" required autoFocus />
        </label>
        <button className="auth-submit" type="submit" disabled={busy || code.length !== 6}>{busy ? "Please wait…" : "Verify and continue"}</button>
      </form>
      <div className="auth-otp-actions">
        <button type="button" onClick={resend} disabled={busy || wait > 0}>{wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
        <button type="button" onClick={onBack} disabled={busy}>Use another email</button>
      </div>
      {message && <p className="auth-message" role="status">{message}</p>}
    </div>
  );
}

// After sign-up / sign-in: does the account still need its email code?
export function needsEmailCode(mode, result) {
  if (mode === "signup") return !result.error && !result.data?.token;
  return result.error?.code === "EMAIL_NOT_VERIFIED";
}
