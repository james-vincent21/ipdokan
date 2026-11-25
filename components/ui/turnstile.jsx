"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { scriptPromise = undefined; reject(new Error("Could not load the security check.")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// Cloudflare Turnstile widget. Calls onToken with a one-time token (or "" when it expires or fails).
// A token works once, so call ref.reset() after every sign-in attempt to get a fresh one.
export const Turnstile = forwardRef(function Turnstile({ onToken }, ref) {
  const box = useRef(null);
  const widgetId = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      onTokenRef.current("");
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    },
  }), []);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;
    loadTurnstile().then((turnstile) => {
      if (cancelled || !box.current) return;
      widgetId.current = turnstile.render(box.current, {
        sitekey: turnstileSiteKey,
        // Match the site's own light/dark theme rather than the device setting.
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        size: "flexible",
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
    }).catch(() => onTokenRef.current(""));
    return () => {
      cancelled = true;
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  if (!turnstileSiteKey) return null;
  return <div ref={box} className="auth-turnstile" />;
});
