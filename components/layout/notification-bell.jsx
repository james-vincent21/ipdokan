"use client";

import { useEffect, useRef, useState } from "react";
import { NOTIFICATION_EVENT, connectRealtime, disconnectRealtime } from "@/lib/realtime-client";
import { NOTIFICATIONS_CHANGED, fetchNotifications, markAllRead, playPing, setRead, timeAgo, useSoundSetting, unlockSound } from "@/lib/notifications";

const TOAST_MS = 6000;

export function SoundIcon({ on }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />{on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>;
}

// Bell with unread count and the latest notifications, plus pop-up toasts and a ping for new ones.
// Shown only to signed-in users; it also opens the live (Socket.IO) connection.
// Opening the list does not mark everything read: clicking a notification does, or "Mark all read".
export function NotificationBell({ signedIn }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Where the list starts on phones and tablets (just under the bell), measured when it opens.
  const [panelTop, setPanelTop] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [sound, setSound] = useSoundSetting();
  const boxRef = useRef(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let active = true;
    const load = () => fetchNotifications({ limit: 15 })
      .then((result) => { if (active) { setItems(result.notifications || []); setUnread(result.unread || 0); } })
      .catch(() => {});
    load();
    unlockSound();
    connectRealtime();
    const onNotification = (event) => {
      const note = event.detail;
      setItems((current) => [note, ...current.filter((item) => item.id !== note.id)].slice(0, 15));
      setUnread((count) => count + 1);
      setToasts((current) => [...current, note].slice(-3));
      playPing({ id: note.id });
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== note.id)), TOAST_MS);
    };
    // A change made on the /notifications page (or in another component).
    const onChanged = (event) => {
      const { id, read, all, unread: count } = event.detail || {};
      if (typeof count === "number") setUnread(count);
      if (all) setItems((current) => current.map((item) => ({ ...item, read: true })));
      else if (id) setItems((current) => current.map((item) => (item.id === id ? { ...item, read } : item)));
    };
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => { active = false; window.removeEventListener(NOTIFICATION_EVENT, onNotification); window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged); disconnectRealtime(); };
  }, [signedIn]);

  // Close the list when clicking elsewhere.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Admin live messages (`live`) are not saved, so their read state stays in this tab only.
  function toggleRead(item, read) {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read } : entry)));
    if (item.live) { setUnread((count) => Math.max(0, count + (read ? -1 : 1))); return; }
    setRead(item.id, read).catch(() => {});
  }

  function readAll() {
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    markAllRead().catch(() => {});
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next) playPing({ force: true });
  }

  if (!signedIn) return null;
  return <>
    <div className="notify" ref={boxRef}>
      <button type="button" className="notify-button" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} onClick={() => { if (!open) setPanelTop(Math.round((boxRef.current?.getBoundingClientRect().bottom || 78) + 10)); setOpen(!open); }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {unread > 0 && <span className="notify-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <div className="notify-panel" role="dialog" aria-label="Notifications" style={panelTop ? { "--notify-top": `${panelTop}px` } : undefined}>
        <div className="notify-head">
          <strong className="notify-title">Notifications{unread > 0 && <small> · {unread} unread</small>}</strong>
          <button type="button" className="notify-icon-button" aria-pressed={sound} title={sound ? "Sound on" : "Sound off"} aria-label={sound ? "Turn notification sound off" : "Turn notification sound on"} onClick={toggleSound}><SoundIcon on={sound} /></button>
        </div>
        {unread > 0 && <button type="button" className="notify-link-button" onClick={readAll}>Mark all as read</button>}
        {items.length ? <ul className="notify-list">{items.map((item) => <li key={item.id} className={item.read ? "" : "is-unread"}>
          <a href={item.link || "#"} onClick={() => { if (!item.read) toggleRead(item, true); setOpen(false); }}><b>{item.title}</b>{item.message && <span>{item.message}</span>}<small>{timeAgo(item.createdAt)}</small></a>
          <button type="button" className="notify-read-toggle" onClick={() => toggleRead(item, !item.read)} title={item.read ? "Mark as unread" : "Mark as read"} aria-label={item.read ? `Mark "${item.title}" as unread` : `Mark "${item.title}" as read`}><span className={item.read ? "notify-dot is-hollow" : "notify-dot"} /></button>
        </li>)}</ul> : <p className="notify-empty">No notifications yet. Order updates and wallet changes show up here.</p>}
        <a className="notify-all-link" href="/notifications" onClick={() => setOpen(false)}>See all notifications</a>
      </div>}
    </div>
    <div className="notify-toasts" aria-live="polite">
      {toasts.map((toast) => <a key={toast.id} className="notify-toast" href={toast.link || "#"}><b>{toast.title}</b>{toast.message && <span>{toast.message}</span>}</a>)}
    </div>
  </>;
}
