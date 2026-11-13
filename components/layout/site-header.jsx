"use client";

import { useEffect, useRef, useState } from "react";

const navItems = [
  { label: "All Item", href: "#products", icon: "▦" },
  { label: "Discount Proxy Panel", href: "#discount", icon: "▤" },
  { label: "Monthly ISP Proxy", href: "#isp", icon: "◎" },
  { label: "Dedicated Servers", href: "#servers", icon: "▥" },
  { label: "Private Proxy", href: "#private-proxy", icon: "▣" },
  { label: "Residential Static Proxy", href: "#residential", icon: "⌂" },
  { label: "VPS", href: "#vps", icon: "▧" },
  { label: "Support", href: "#support", icon: "◌" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authMessage, setAuthMessage] = useState("");
  const searchInputRef = useRef(null);
  const searchResults = searchQuery.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

  useEffect(() => {
    if (!searchOpen) return undefined;
    searchInputRef.current?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [searchOpen]);

  useEffect(() => {
    if (!authOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setAuthOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [authOpen]);

  function submitSearch(event) {
    event.preventDefault();
    if (searchResults[0]) {
      window.location.hash = searchResults[0].href;
      setSearchQuery("");
      setMenuOpen(false);
      setSearchOpen(false);
    }
  }

  return (
    <>
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="#home" aria-label="IP DOKAN home">
          <img className="brand-logo" src="/ip-dokan-logo.svg" alt="IP DOKAN" />
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span className="menu-toggle-label">{menuOpen ? "Close" : "Menu"}</span>
          <span className="menu-lines" aria-hidden="true"><i /><i /></span>
        </button>
        <nav id="primary-navigation" className={`nav-links${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          {navItems.map((item, index) => (
            <a
              className={`nav-link${index === 0 ? " is-active" : ""}`}
              href={item.href}
              key={item.label}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </a>
          ))}
          <div className="nav-actions">
            <button className="sign-in" type="button" onClick={() => { setMenuOpen(false); setAuthMode("signin"); setAuthMessage(""); setAuthOpen(true); }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Sign in</span>
            </button>
          </div>
        </nav>
        <button className="nav-search-trigger" type="button" aria-label="Search services" onClick={() => { setSearchQuery(""); setSearchOpen(true); setMenuOpen(false); }}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </div>
    </header>
    {searchOpen && (
      <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <section className="search-modal" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
          <div className="search-modal-heading">
            <div><span className="search-modal-kicker">IP DOKAN</span><h2 id="search-modal-title">Search services</h2></div>
            <button className="search-modal-close" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>×</button>
          </div>
          <form className="search-modal-form" role="search" onSubmit={submitSearch}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input ref={searchInputRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Try ‘ISP proxy’ or ‘VPS’" aria-label="Search services" />
            <kbd>ESC</kbd>
          </form>
          {searchQuery.trim() ? (
            <div className="search-modal-results">
              {searchResults.length ? searchResults.map((item) => (
                <a href={item.href} key={item.label} onClick={() => { setSearchQuery(""); setMenuOpen(false); setSearchOpen(false); }}>
                  <span className="search-result-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><span className="search-result-arrow" aria-hidden="true">↗</span>
                </a>
              )) : <p className="search-empty">No matching services found.</p>}
            </div>
          ) : <p className="search-hint">Search our proxy and server services.</p>}
        </section>
      </div>
    )}
    {authOpen && (
      <div className="auth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
        <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <button className="search-modal-close auth-close" type="button" aria-label="Close sign in" onClick={() => setAuthOpen(false)}>×</button>
          <span className="auth-kicker">IP DOKAN ACCOUNT</span>
          <h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
          <p className="auth-description">Sign in or create an account to continue.</p>
          <div className="auth-mode-switch" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={authMode === "signin"} className={authMode === "signin" ? "is-active" : ""} onClick={() => { setAuthMode("signin"); setAuthMessage(""); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={authMode === "signup"} className={authMode === "signup" ? "is-active" : ""} onClick={() => { setAuthMode("signup"); setAuthMessage(""); }}>Sign up</button>
          </div>
          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setAuthMessage("Account access is not connected yet."); }}>
            {authMode === "signup" && <label>Name<input type="text" name="name" autoComplete="name" placeholder="Your name" required /></label>}
            <label>Email<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder="Enter your password" required /></label>
            <button className="auth-submit" type="submit">{authMode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          <div className="auth-divider"><span>or</span></div>
          <button className="auth-google" type="button" onClick={() => setAuthMessage("Google sign-in is not connected yet.")}><svg className="google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9L31 34c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.8 19.8 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3c1.6-4.9 6.1-8.5 11.4-8.5Z"/></svg>Continue with Google</button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </section>
      </div>
    )}
    </>
  );
}
