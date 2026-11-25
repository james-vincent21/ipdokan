"use client";

import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_EVENT, connectRealtime, disconnectRealtime } from "@/lib/realtime-client";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const TOAST_MS = 6000;

function timeAgo(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

// Bell with unread count and the latest notifications, plus pop-up toasts for new ones.
// Shown only to signed-in users; it also opens the live (Socket.IO) connection.
export function NotificationBell({ signedIn }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    fetch(`${apiUrl}/api/notifications`, { credentials: "include", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (active && result) { setItems(result.notifications || []); setUnread(result.unread || 0); } })
      .catch(() => {});
    connectRealtime();
    const onNotification = (event) => {
      const note = event.detail;
      setItems((current) => [note, ...current.filter((item) => item.id !== note.id)].slice(0, 20));
      setUnread((count) => count + 1);
      setToasts((current) => [...current, note].slice(-3));
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== note.id)), TOAST_MS);
    };
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    return () => { active = false; window.removeEventListener(NOTIFICATION_EVENT, onNotification); disconnectRealtime(); };
  }, [signedIn]);

  // Close the list when clicking elsewhere.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      setUnread(0);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      fetch(`${apiUrl}/api/notifications/read`, { method: "POST", credentials: "include" }).catch(() => {});
    }
  }

  if (!signedIn) return null;
  return <>
    <div className="notify" ref={boxRef}>
      <button type="button" className="notify-button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {unread > 0 && <span className="notify-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && <div className="notify-panel" role="dialog" aria-label="Notifications">
        <strong className="notify-title">Notifications</strong>
        {items.length ? <ul className="notify-list">{items.map((item) => <li key={item.id} className={item.read ? "" : "is-unread"}>
          <a href={item.link || "#"} onClick={() => setOpen(false)}><b>{item.title}</b>{item.message && <span>{item.message}</span>}<small>{timeAgo(item.createdAt)}</small></a>
        </li>)}</ul> : <p className="notify-empty">No notifications yet. Order updates and wallet changes show up here.</p>}
      </div>}
    </div>
    <div className="notify-toasts" aria-live="polite">
      {toasts.map((toast) => <a key={toast.id} className="notify-toast" href={toast.link || "#"}><b>{toast.title}</b>{toast.message && <span>{toast.message}</span>}</a>)}
    </div>
  </>;
}
