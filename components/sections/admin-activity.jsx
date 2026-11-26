"use client";

import { useEffect, useState } from "react";
import { useErrorToast } from "@/lib/toast";
import { AdminUserPicker } from "./admin-user-picker";

const TYPES = [["", "Everything"], ["login", "Sign-ins"], ["page_view", "Pages"], ["click", "Clicks"]];
const DEVICE_ICON = { Mobile: "📱", Tablet: "📲", Desktop: "💻" };
const TYPE_ICON = { login: "🔑", page_view: "📄", click: "👆" };

function describe(event) {
  if (event.type === "login") return <>Signed in{event.method ? <> with <b>{event.method}</b></> : null}</>;
  if (event.type === "page_view") return <>Opened <code>{event.path}</code></>;
  return <>Clicked <b>“{event.label || "…"}”</b>{event.href && event.href !== event.path ? <> → <code>{event.href}</code></> : null} on <code>{event.path}</code></>;
}

const deviceLine = (event) => [event.device && `${DEVICE_ICON[event.device] || ""} ${event.device}`, event.browser, event.os].filter(Boolean).join(" · ");

// Admin: what customers did — sign-ins with device/browser/OS and IP, pages opened and buttons/links clicked.
// `focusUser` (from the Users tab) opens one customer's log.
export function AdminActivity({ api, focusUser }) {
  const [user, setUser] = useState(focusUser || null);
  const [type, setType] = useState("");
  const [data, setData] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (user) params.set("userId", user.id);
    if (type) params.set("type", type);
    api(`/admin/activity?${params}`)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [api, user, type]);

  async function loadMore() {
    if (!data?.nextBefore) return;
    setLoadingMore(true);
    const params = new URLSearchParams({ before: data.nextBefore });
    if (user) params.set("userId", user.id);
    if (type) params.set("type", type);
    try {
      const result = await api(`/admin/activity?${params}`);
      setData((current) => ({ ...current, events: [...current.events, ...result.events], nextBefore: result.nextBefore }));
    } catch (requestError) { setError(requestError.message); }
    finally { setLoadingMore(false); }
  }

  const shownUser = data?.user && user && data.user.id === user.id ? { ...user, ...data.user, name: data.user.name || user.name, email: data.user.email || user.email } : user;
  return <>
    <section className="admin-card admin-activity-head">
      <h2>Customer activity</h2>
      <p className="admin-coupon-intro">Sign-ins with device, browser, operating system and IP address, plus every page a signed-in customer opened and every button or link they clicked. Kept for 180 days. What customers type is never recorded.</p>
      <div className="admin-activity-controls">
        {user ? <div className="admin-activity-user">
          <span className="admin-activity-avatar" aria-hidden="true">{(shownUser.name || shownUser.email || "?").charAt(0).toUpperCase()}</span>
          <div><strong>{shownUser.name || "No name"}</strong><span>{shownUser.email}</span></div>
          <button type="button" className="admin-secondary" onClick={() => { setUser(null); setData(null); }}>Show all customers</button>
        </div> : <AdminUserPicker api={api} onPick={(picked) => { setUser(picked); setData(null); }} placeholder="Find a customer by name or email to see only their activity…" />}
        <div className="admin-activity-types" role="group" aria-label="Show">{TYPES.map(([value, label]) => <button type="button" key={label} className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => { setType(value); setData(null); }}>{label}</button>)}</div>
      </div>
    </section>

    {user && data?.summary && <section className="admin-card">
      <h2>Devices used</h2>
      <div className="admin-activity-stats">{[["Sign-ins", data.summary.login || 0], ["Pages opened", data.summary.page_view || 0], ["Clicks", data.summary.click || 0], ["Devices", data.devices?.length || 0]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      {data.devices?.length ? <div className="admin-table-scroll"><table className="admin-table">
        <thead><tr><th>Device</th><th>Browser</th><th>Operating system</th><th>Sign-ins</th><th>IP addresses</th><th>First seen</th><th>Last seen</th></tr></thead>
        <tbody>{data.devices.map((device) => <tr key={`${device.device}|${device.browser}|${device.os}`}>
          <td>{DEVICE_ICON[device.device] || ""} {device.device || "—"}</td><td>{device.browser || "—"}</td><td>{device.os || "—"}</td><td>{device.logins}</td>
          <td>{device.ips.join(", ") || "—"}</td><td>{new Date(device.firstSeen).toLocaleString()}</td><td>{new Date(device.lastSeen).toLocaleString()}</td>
        </tr>)}</tbody>
      </table></div> : <p className="admin-coupon-hint">No activity recorded for this customer yet.</p>}
    </section>}

    <section className="admin-card">
      <h2>{user ? "Timeline" : "Latest activity"} <small>({data?.events?.length || 0}{data?.nextBefore ? "+" : ""})</small></h2>
      {!data ? <p className="admin-loading">Loading activity…</p> : data.events.length ? <>
        <ol className="admin-activity-list">{data.events.map((event) => <li key={event.id} className={`is-${event.type}`}>
          <span className="admin-activity-icon" aria-hidden="true">{TYPE_ICON[event.type]}</span>
          <div className="admin-activity-body">
            <p>{!user && <button type="button" className="admin-activity-who" onClick={() => { setUser({ id: event.userId, name: event.userName, email: event.userEmail }); setData(null); }}>{event.userName || event.userEmail || "Customer"}</button>}{describe(event)}</p>
            <small>{deviceLine(event)}{event.ip ? ` · IP ${event.ip}` : ""}</small>
          </div>
          <time dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString()}>{new Date(event.createdAt).toLocaleString()}</time>
        </li>)}</ol>
        {data.nextBefore && <button type="button" className="admin-secondary admin-activity-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load older activity"}</button>}
      </> : <p className="admin-coupon-hint">No activity yet. It appears here as signed-in customers use the site.</p>}
    </section>
  </>;
}
