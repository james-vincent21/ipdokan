"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearAdminDashboardCache } from "@/lib/admin-dashboard-cache";
import { useCurrencyPreference } from "@/lib/currency-preference";

const navItems = [
  { label: "All Item", href: "/catalog", icon: "▦" },
  { label: "Discount Proxy Panel", href: "/catalog?category=Discount%20Proxy%20Panel", icon: "▤" },
  { label: "Monthly ISP Proxy", href: "/#isp", icon: "◎" },
  { label: "Dedicated Servers", href: "/#servers", icon: "▥" },
  { label: "Private Proxy", href: "/#private-proxy", icon: "▣" },
  { label: "Residential Static Proxy", href: "/#residential", icon: "⌂" },
  { label: "VPS", href: "/#vps", icon: "▧" },
  { label: "Support", href: "/#support", icon: "◌" },
];
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function SiteHeader() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchProducts, setSearchProducts] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currency, setCurrency] = useCurrencyPreference();
  const searchInputRef = useRef(null);
  const searchLoadedRef = useRef(false);
  const matchingNavItems = searchQuery.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];
  const matchingProducts = searchQuery.trim()
    ? searchProducts.filter((product) => [product.name, product.brand, product.category, product.codeNumber].some((field) => String(field || "").toLowerCase().includes(searchQuery.trim().toLowerCase()))).slice(0, 8)
    : [];

  useEffect(() => {
    if (sessionPending || !session?.user) { setIsAdmin(false); return; }
    let active = true;
    fetch(`${apiUrl}/api/admin/access`, { credentials: "include" })
      .then((response) => { if (active) setIsAdmin(response.ok); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [session?.user?.email, sessionPending]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    searchInputRef.current?.focus();
    if (!searchLoadedRef.current) {
      setSearchLoading(true);
      setSearchError("");
      fetch(`${apiUrl}/api/products`, { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Could not load products.");
          setSearchProducts(result.products || []);
          searchLoadedRef.current = true;
        })
        .catch(() => setSearchError("Products could not be loaded. Try again in a moment."))
        .finally(() => setSearchLoading(false));
    }
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
    if (matchingProducts[0]) {
      window.location.href = `/product/${encodeURIComponent(matchingProducts[0].id)}`;
      setSearchQuery("");
      setMenuOpen(false);
      setSearchOpen(false);
    } else if (matchingNavItems[0]) {
      window.location.href = matchingNavItems[0].href;
      setSearchQuery("");
      setMenuOpen(false);
      setSearchOpen(false);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const credentials = { email: form.get("email"), password: form.get("password") };
      const result = authMode === "signup"
        ? await authClient.signUp.email({ ...credentials, name: form.get("name") })
        : await authClient.signIn.email(credentials);
      if (result.error) throw new Error(result.error.message || "Could not sign in.");
      if (!window.location.search.includes("oauth_query=")) window.location.href = "/profile";
    } catch (error) {
      setAuthMessage(error.message || "Could not reach the account server.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signInWithGoogle() {
    setAuthBusy(true);
    setAuthMessage("");
    const callbackURL = window.location.search.includes("oauth_query=")
      ? window.location.href
      : `${window.location.origin}/profile`;
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL });
      if (result.error) throw new Error(result.error.message || "Could not start Google sign-in.");
    } catch (error) {
      setAuthMessage(error.message || "Could not start Google sign-in.");
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthMessage("");
    try {
      const result = await authClient.signOut();
      if (result?.error) throw new Error(result.error.message || "Could not sign out.");
      clearAdminDashboardCache();
      window.dispatchEvent(new Event("ipdokan:signout"));
      window.location.assign("/");
    } catch (error) { setAuthMessage(error.message || "Could not sign out."); }
  }

  return (
    <>
    <header className="site-header" id="top">
      <div className="nav-shell">
        <a className="brand" href="/" aria-label="IP DOKAN home">
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
          <a className="nav-link account-nav-link" href="/profile" onClick={() => setMenuOpen(false)}>Account</a>
          <a className="nav-link cart-nav-link" href="/checkout" onClick={() => setMenuOpen(false)}>Cart</a>
          {isAdmin && <a className="nav-link" href="/admin" onClick={() => setMenuOpen(false)}>Admin dashboard</a>}
          <div className="nav-actions">
            <div className="nav-currency-toggle" aria-label="Choose display currency"><button type="button" className={currency === "USD" ? "is-selected" : ""} aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")}>USD</button><button type="button" className={currency === "BDT" ? "is-selected" : ""} aria-pressed={currency === "BDT"} onClick={() => setCurrency("BDT")}>BDT</button></div>
            {session?.user ? <><a className="sign-in signed-in-user" href="/profile" title="Open your account" onClick={() => setMenuOpen(false)}>
              <span className="signed-in-avatar">{(session.user.name || session.user.email || "U").slice(0, 1).toUpperCase()}</span>
              <span>{session.user.name || "Account"}</span>
            </a><button className="sign-in sign-out-button" type="button" onClick={signOut}>Sign out</button></> : sessionPending ? <span className="nav-session-loading" aria-label="Checking sign-in status" /> : <button className="sign-in" type="button" onClick={() => { setMenuOpen(false); setAuthMode("signin"); setAuthMessage(""); setAuthOpen(true); }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Sign in</span>
            </button>}
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
          <div><span className="search-modal-kicker">IP DOKAN</span><h2 id="search-modal-title">Search products &amp; services</h2></div>
            <button className="search-modal-close" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>×</button>
          </div>
          <form className="search-modal-form" role="search" onSubmit={submitSearch}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input ref={searchInputRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Try ‘9proxy’, ‘5 GB’, or ‘VPS’" aria-label="Search products and services" />
            <kbd>ESC</kbd>
          </form>
          {searchQuery.trim() ? (
            <div className="search-modal-results">
              {matchingProducts.map((product) => (
                <a href={`/product/${encodeURIComponent(product.id)}`} key={`product-${product.id}`} onClick={() => { setSearchQuery(""); setMenuOpen(false); setSearchOpen(false); }}>
                  <span className="search-result-icon" aria-hidden="true">{product.name?.trim()?.charAt(0).toUpperCase() || "P"}</span><span>{product.name}<small>{product.brand || product.category || product.codeNumber}</small></span><span className="search-result-arrow" aria-hidden="true">↗</span>
                </a>
              ))}
              {matchingNavItems.map((item) => (
                <a href={item.href} key={`nav-${item.label}`} onClick={() => { setSearchQuery(""); setMenuOpen(false); setSearchOpen(false); }}>
                  <span className="search-result-icon" aria-hidden="true">{item.icon}</span><span>{item.label}<small>Category</small></span><span className="search-result-arrow" aria-hidden="true">↗</span>
                </a>
              ))}
              {!matchingProducts.length && !matchingNavItems.length && <p className="search-empty">{searchLoading ? "Searching products…" : searchError || "No matching products or services found."}</p>}
            </div>
          ) : <p className="search-hint">Search product name, brand, category, or service.</p>}
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
          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === "signup" && <label>Name<input type="text" name="name" autoComplete="name" placeholder="Your name" required /></label>}
            <label>Email<input type="email" name="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder="Enter your password" minLength={authMode === "signup" ? 10 : undefined} maxLength={128} required /></label>
            <button className="auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button>
          </form>
          <div className="auth-divider"><span>or</span></div>
          <button className="auth-google" type="button" disabled={authBusy} onClick={signInWithGoogle}><svg className="google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.9L31 34c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.3H5.8a20 20 0 0 0 0 17.8l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.9-5.9A19.8 19.8 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.3c1.6-4.9 6.1-8.5 11.4-8.5Z"/></svg>Continue with Google</button>
          {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
        </section>
      </div>
    )}
    </>
  );
}
