"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFICATION_EVENT } from "@/lib/realtime-client";
import { NOTIFICATIONS_CHANGED, fetchNotifications, markAllRead, playPing, setRead, timeAgo, useSoundSetting } from "@/lib/notifications";
import { SoundIcon } from "@/components/layout/notification-bell";

// Full notification history: newest first, 20 at a time, with read / unread per notification.
export function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState("all");
  const [state, setState] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [sound, setSound] = useSoundSetting();

  const load = useCallback(async (nextFilter, before) => {
    const result = await fetchNotifications({ before, unreadOnly: nextFilter === "unread" });
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    load(filter).then((result) => {
      if (!active) return;
      setItems(result.notifications || []); setUnread(result.unread || 0); setHasMore(Boolean(result.hasMore)); setState("ready");
    }).catch(() => { if (active) setState("signed-out"); });
    return () => { active = false; };
  }, [filter, load]);

  // New notifications appear at the top; read changes from the bell are mirrored here.
  useEffect(() => {
    const onNotification = (event) => { setItems((current) => [event.detail, ...current.filter((item) => item.id !== event.detail.id)]); setUnread((count) => count + 1); };
    const onChanged = (event) => {
      const { id, read, all, unread: count } = event.detail || {};
      if (typeof count === "number") setUnread(count);
      if (all) setItems((current) => current.map((item) => ({ ...item, read: true })));
      else if (id) setItems((current) => current.map((item) => (item.id === id ? { ...item, read } : item)));
    };
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => { window.removeEventListener(NOTIFICATION_EVENT, onNotification); window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged); };
  }, []);

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const result = await load(filter, last.createdAt);
      setItems((current) => [...current, ...(result.notifications || []).filter((item) => !current.some((entry) => entry.id === item.id))]);
      setHasMore(Boolean(result.hasMore));
    } catch { /* keep what is shown */ }
    finally { setLoadingMore(false); }
  }

  function toggleRead(item, read) {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read } : entry)));
    if (item.live) return;
    setRead(item.id, read).catch(() => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read: !read } : entry))));
  }

  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next) playPing({ force: true });
  }

  return <main className="profile-page notifications-page">
    <div className="profile-shell">
      <header className="notifications-heading">
        <div><span className="auth-kicker">IP DOKAN</span><h1>Notifications</h1><p>{unread ? `${unread} unread` : "You are all caught up."}</p></div>
        <div className="notifications-tools">
          <button type="button" className="admin-secondary notifications-sound" aria-pressed={sound} onClick={toggleSound}><SoundIcon on={sound} />{sound ? "Sound on" : "Sound off"}</button>
          {unread > 0 && <button type="button" className="admin-secondary" onClick={() => { setUnread(0); setItems((current) => current.map((item) => ({ ...item, read: true }))); markAllRead().catch(() => {}); }}>Mark all as read</button>}
        </div>
      </header>
      <div className="notifications-filter" role="tablist" aria-label="Show">
        {[["all", "All"], ["unread", "Unread"]].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? "is-selected" : ""} onClick={() => { setState("loading"); setFilter(value); }}>{label}</button>)}
      </div>
      {state === "loading" && <section className="profile-card profile-state" aria-busy="true"><span className="profile-spinner" aria-hidden="true" /><p className="profile-message">Loading notifications…</p></section>}
      {state === "signed-out" && <section className="profile-card profile-state"><p className="profile-message">Sign in to see your notifications.</p></section>}
      {state === "ready" && <section className="profile-card notifications-card">
        {items.length ? <ul className="notifications-list">{items.map((item) => <li key={item.id} className={item.read ? "" : "is-unread"}>
          <a href={item.link || "#"} onClick={() => { if (!item.read) toggleRead(item, true); }}>
            <b>{item.title}</b>{item.message && <span>{item.message}</span>}<time dateTime={new Date(item.createdAt).toISOString()} title={new Date(item.createdAt).toLocaleString()}>{timeAgo(item.createdAt)}</time>
          </a>
          <button type="button" className="notifications-read-toggle" onClick={() => toggleRead(item, !item.read)}>{item.read ? "Mark unread" : "Mark read"}</button>
        </li>)}</ul> : <p className="profile-message">{filter === "unread" ? "No unread notifications." : "No notifications yet. Order updates and wallet changes show up here."}</p>}
        {hasMore && <button type="button" className="admin-secondary notifications-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load older notifications"}</button>}
      </section>}
    </div>
  </main>;
}
