"use client";

import { useEffect, useState } from "react";

// Search customers by name or email (verified accounts) and pick one. `exclude`: ids already chosen.
export function AdminUserPicker({ api, onPick, exclude = [], placeholder = "Search customer by name or email…" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      setStatus("Searching…");
      api(`/admin/users/search?q=${encodeURIComponent(text)}`)
        .then((result) => { if (active) { setResults(result.users || []); setStatus(result.users?.length ? "" : "No customer found."); } })
        .catch((error) => { if (active) { setResults([]); setStatus(error.message); } });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [api, query]);

  const shown = query.trim().length < 2 ? [] : results.filter((user) => !exclude.includes(String(user.id)));
  return <div className="admin-user-picker">
    <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim().length < 2) { setResults([]); setStatus(""); } }} placeholder={placeholder} autoComplete="off" />
    {query.trim().length >= 2 && (shown.length > 0 || status) && <div className="admin-user-picker-results" role="listbox">
      {shown.map((user) => <button type="button" role="option" aria-selected="false" key={user.id} onClick={() => { onPick({ id: String(user.id), name: user.name || "", email: user.email || "" }); setQuery(""); setResults([]); setStatus(""); }}>
        <strong>{user.name || "No name"}</strong><span>{user.email}</span>{user.banned && <em>Banned</em>}
      </button>)}
      {!shown.length && status && <p>{status}</p>}
    </div>}
  </div>;
}
