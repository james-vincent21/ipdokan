// Site-wide toasts. Call toast.error("…") (or .success / .info) from anywhere in the browser;
// <Toaster /> in the root layout shows them. useErrorToast(error) shows a component's error state as a toast.
import { useEffect } from "react";

export const TOAST_EVENT = "ipdokan-toast";

function show(type, message, options = {}) {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, message: String(message), action: options.action || null, duration: options.duration } }));
}

export const toast = {
  error: (message, options) => show("error", message, options),
  success: (message, options) => show("success", message, options),
  info: (message, options) => show("info", message, options),
};

// Shows `error` as a toast each time it changes to a new non-empty message.
// `action` ({ href, label }) adds a link to the toast, e.g. "Go to sign in".
export function useErrorToast(error, action = null) {
  useEffect(() => {
    if (error) toast.error(error, { action });
    // `action` is built inline by callers; only a new error message should show a toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
}
