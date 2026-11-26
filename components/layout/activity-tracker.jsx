"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const FLUSH_EVERY_MS = 8000;
// Admin pages are not logged: the log is about what customers do.
const skipPath = (path) => path.startsWith("/admin");

let queue = [];
// When the server says nobody is signed in, events are dropped for a minute instead of being sent.
let pausedUntil = 0;

function flush(leaving = false) {
  if (!queue.length) return;
  const events = queue.splice(0, 30);
  if (Date.now() < pausedUntil) return;
  fetch(`${apiUrl}/api/activity`, { method: "POST", credentials: "include", keepalive: leaving, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events }) })
    .then((response) => response.ok ? response.json() : null)
    .then((result) => { if (result && result.signedIn === false) { pausedUntil = Date.now() + 60_000; queue = []; } })
    .catch(() => {});
  if (queue.length && !leaving) flush();
}

function track(event) {
  const path = `${window.location.pathname}${window.location.search}`;
  if (skipPath(window.location.pathname) || Date.now() < pausedUntil) return;
  queue.push({ ...event, path, at: Date.now() });
  if (queue.length >= 30) flush();
}

// The visible text of what was clicked. Only buttons and links are logged, never what is typed into fields.
function clickTarget(target) {
  const element = target instanceof Element ? target.closest("a, button, [role='button'], [role='tab'], summary") : null;
  if (!element || element.closest("[data-no-track]")) return null;
  const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  const label = (text || element.getAttribute("title") || element.getAttribute("aria-label") || element.tagName.toLowerCase()).slice(0, 120);
  let href = "";
  if (element instanceof HTMLAnchorElement && element.href) {
    try {
      const url = new URL(element.href);
      href = url.origin === window.location.origin ? `${url.pathname}${url.search}` : `${url.origin}${url.pathname}`;
    } catch { href = ""; }
  }
  return { label, href };
}

// Records page views and clicks of signed-in customers for the admin Activity tab.
export function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => { track({ type: "page_view" }); }, [pathname]);

  useEffect(() => {
    const onClick = (event) => {
      const target = clickTarget(event.target);
      if (target) track({ type: "click", ...target });
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    const onPageHide = () => flush(true);
    const timer = window.setInterval(() => flush(), FLUSH_EVERY_MS);
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
