"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { clearAdminDashboardCache } from "@/lib/admin-dashboard-cache";
import { useCurrencyPreference } from "@/lib/currency-preference";
import { Icon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { productHref } from "@/lib/proxy-links";
import { NotificationBell } from "@/components/layout/notification-bell";
import { cartCount, onCartChange, readCart } from "@/lib/cart-store";

// The signed-in user's photo (from their Google account), or their first letter when there is none
// or it fails to load. Google photos are loaded without a referrer, which Google requires.
function UserAvatar({ user }) {
  const [broken, setBroken] = useState(false);
  const letter = (user.name || user.email || "U").slice(0, 1).toUpperCase();
  if (user.image && !broken) return <img className="signed-in-avatar signed-in-photo" src={user.image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="signed-in-avatar">{letter}</span>;
}

// Number of items in the cart, kept live (this tab, other tabs and, when signed in, other devices).
const useCartCount = () => useSyncExternalStore(onCartChange, () => cartCount(readCart()), () => 0);

// Product categories shown under "Services" in the nav (and searchable on their own).
// Discount Proxy Panel sits directly in the nav so every visitor sees it.
const serviceItems = [
  { label: "Monthly ISP Proxy", href: "/proxies?type=isp", icon: "wifi", note: "ISP & Premium ISP · choose location" },
  { label: "Private Proxy", href: "/proxies?type=datacenter", icon: "shield", note: "Dedicated datacenter IPs" },
  { label: "Residential Static Proxy", href: "/proxies?type=static-residential", icon: "home", note: "Real home IPs that stay fixed" },
  { label: "Dedicated Servers", href: "/catalog?category=Dedicated%20Servers", icon: "server", note: "Bare-metal servers" },
  { label: "VPS", href: "/catalog?category=VPS", icon: "cloud", note: "Virtual private servers" },
];
const allItem = { label: "All Item", href: "/catalog", icon: "grid" };
const discountItem = { label: "Discount Proxy Panel", href: "/catalog?category=Discount%20Proxy%20Panel", icon: "discount" };
const supportItem = { label: "Support", href: "/#support", icon: "support" };
const navItems = [allItem, discountItem, ...serviceItems, supportItem];
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Which nav item belongs to the current page ("" = none, e.g. the home page or the profile).
function navKeyFor({ pathname, search, hash }) {
  const category = new URLSearchParams(search).get("category") || "";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/wallet")) return "wallet";
  if (pathname.startsWith("/checkout")) return "cart";
  if (pathname.startsWith("/proxies")) return "services";
  if (pathname.startsWith("/catalog")) return category === discountItem.label ? "discount" : ["Dedicated Servers", "VPS"].includes(category) ? "services" : "all";
  if (pathname.startsWith("/product")) return "all";
  if (pathname === "/" && hash === "#support") return "support";
  return "";
}
// The item that was current when a nav link was clicked; the next page slides the pill from there.
const NAV_FROM_KEY = "ipdokan-nav-from";
// Read once per page load (the placement effect runs again when the session loads, and twice in dev).
let navSlideFrom = null;

export function SiteHeader() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  // Set when a mouse hover opened the Services menu, so the click that usually follows keeps it open.
  const servicesHoverOpened = useRef(false);
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
  const itemsInCart = useCartCount();
  const headerRef = useRef(null);

  // Marks the header once the page is scrolled (transparent at the top, a see-through tint after).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return undefined;
    const update = () => header.classList.toggle("is-scrolled", window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const searchInputRef = useRef(null);
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const currentNavKey = useRef("");
  const searchLoadedRef = useRef(false);
  const matchingNavItems = searchQuery.trim()
    ? navItems.filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];
  const matchingProducts = searchQuery.trim()
    ? searchProducts.filter((product) => [product.name, product.brand, product.category, product.codeNumber].some((field) => String(field || "").toLowerCase().includes(searchQuery.trim().toLowerCase()))).slice(0, 8)
    : [];

  // Marks the current nav item and moves the blue pill behind it. After a click on another page the pill
  // starts at the item that was current there and slides over. Done on the DOM, before paint.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return undefined;
    const itemFor = (key) => (key ? nav.querySelector(`[data-nav-key="${key}"]`) : null);
    const place = (element, animate) => {
      if (!element || !element.offsetParent) { indicator.style.opacity = "0"; return; }
      const box = nav.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      indicator.style.transition = animate ? "" : "none";
      indicator.style.transform = `translate(${rect.left - box.left}px, ${rect.top - box.top + 1}px)`;
      indicator.style.width = `${rect.width}px`;
      indicator.style.height = `${rect.height}px`;
      indicator.style.opacity = "1";
    };
    // Moves the pill to the current item: a slide from the previous item when it changed, otherwise a
    // smooth correction (so a re-run during a slide continues it instead of jumping to the end).
    const sync = () => {
      const key = navKeyFor(window.location);
      const previous = currentNavKey.current;
      currentNavKey.current = key;
      nav.querySelectorAll("[data-nav-key]").forEach((element) => {
        const current = element.dataset.navKey === key;
        element.classList.toggle("is-current", current);
        if (element.tagName === "A") { if (current) element.setAttribute("aria-current", "page"); else element.removeAttribute("aria-current"); }
      });
      if (previous && previous !== key && itemFor(previous)) {
        place(itemFor(previous), false);
        indicator.getBoundingClientRect(); // apply the start position before the slide
        place(itemFor(key), true);
      } else place(itemFor(key), Boolean(previous) && indicator.style.opacity === "1");
    };
    if (navSlideFrom === null) {
      navSlideFrom = "";
      try { navSlideFrom = sessionStorage.getItem(NAV_FROM_KEY) || ""; sessionStorage.removeItem(NAV_FROM_KEY); } catch { /* storage blocked */ }
    }
    if (!currentNavKey.current) { currentNavKey.current = navSlideFrom; navSlideFrom = ""; }
    sync();
    const relayout = () => place(itemFor(currentNavKey.current), true);
    const onHash = () => sync();
    const observer = new ResizeObserver(relayout);
    observer.observe(nav);
    nav.querySelectorAll("[data-nav-key], .nav-actions").forEach((element) => observer.observe(element));
    window.addEventListener("hashchange", onHash);
    document.fonts?.ready.then(relayout).catch(() => {});
    return () => { observer.disconnect(); window.removeEventListener("hashchange", onHash); };
  }, [isAdmin, session?.user, sessionPending]);

  // Remembers which item was current when a nav link is clicked, for the slide on the next page.
  function rememberNavStart(event) {
    if (!event.target.closest?.("a[data-nav-key]")) return;
    try { sessionStorage.setItem(NAV_FROM_KEY, currentNavKey.current); } catch { /* storage blocked */ }
  }

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
      window.location.href = productHref(matchingProducts[0]);
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
    <header className="site-header" id="top" ref={headerRef}>
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
        <nav id="primary-navigation" ref={navRef} onClickCapture={rememberNavStart} className={`nav-links${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <span className="nav-indicator" ref={indicatorRef} aria-hidden="true" />
          <a className="nav-link" data-nav-key="all" href={allItem.href} onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name={allItem.icon} /></span>{allItem.label}</a>
          <a className="nav-link nav-link-highlight" data-nav-key="discount" href={discountItem.href} onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name={discountItem.icon} /></span>{discountItem.label}</a>
          {/* Opens on hover (desktop) or tap (touch / mobile menu). */}
          <div
            className={`nav-dropdown${servicesOpen ? " is-open" : ""}`}
            onPointerEnter={(event) => { if (event.pointerType === "mouse") { servicesHoverOpened.current = true; setServicesOpen(true); } }}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") { servicesHoverOpened.current = false; setServicesOpen(false); } }}
            onKeyDown={(event) => { if (event.key === "Escape") setServicesOpen(false); }}
          >
            <button className="nav-link nav-dropdown-trigger" data-nav-key="services" type="button" aria-expanded={servicesOpen} aria-controls="services-menu" onClick={() => {
              if (servicesHoverOpened.current) { servicesHoverOpened.current = false; setServicesOpen(true); }
              else setServicesOpen((open) => !open);
            }}>
              <span className="nav-icon"><Icon name="layers" /></span>Services<span className="nav-dropdown-caret"><Icon name="chevronDown" /></span>
            </button>
            <div className="nav-dropdown-menu" id="services-menu">
              {serviceItems.map((item) => (
                <a className="nav-dropdown-item" href={item.href} key={item.label} onClick={() => { setServicesOpen(false); setMenuOpen(false); }}>
                  <span className="nav-dropdown-icon"><Icon name={item.icon} /></span>
                  <span><strong>{item.label}</strong><small>{item.note}</small></span>
                </a>
              ))}
            </div>
          </div>
          <a className="nav-link" data-nav-key="support" href={supportItem.href} onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name={supportItem.icon} /></span>{supportItem.label}</a>
          <a className="nav-link account-nav-link" href="/profile" onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name="user" /></span>Account</a>
          {isAdmin && <a className="nav-link" data-nav-key="admin" href="/admin" onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name="dashboard" /></span>Admin dashboard</a>}
          <div className="nav-actions">
            {/* Wallet and cart sit on the right, next to the account controls. */}
            <a className="nav-link nav-action-link wallet-nav-link" data-nav-key="wallet" href="/wallet" onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name="wallet" /></span>Wallet</a>
            <a className="nav-link nav-action-link cart-nav-link" data-nav-key="cart" href="/checkout" onClick={() => setMenuOpen(false)}><span className="nav-icon"><Icon name="cart" />{itemsInCart > 0 && <span className="cart-count" aria-label={`${itemsInCart} in cart`}>{itemsInCart > 99 ? "99+" : itemsInCart}</span>}</span>Cart</a>
            <ThemeToggle />
            <div className="nav-currency-toggle" aria-label="Choose display currency"><button type="button" className={currency === "USD" ? "is-selected" : ""} aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")}>USD</button><button type="button" className={currency === "BDT" ? "is-selected" : ""} aria-pressed={currency === "BDT"} onClick={() => setCurrency("BDT")}>BDT</button></div>
            {session?.user ? <><a className="sign-in signed-in-user" href="/profile" title="Open your account" onClick={() => setMenuOpen(false)}>
              <UserAvatar user={session.user} />
              <span>{session.user.name || "Account"}</span>
            </a><button className="sign-in sign-out-button" type="button" onClick={signOut}>Sign out</button></> : sessionPending ? <span className="nav-session-loading" aria-label="Checking sign-in status" /> : <button className="sign-in" type="button" onClick={() => { setMenuOpen(false); setAuthMode("signin"); setAuthMessage(""); setAuthOpen(true); }}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span>Sign in</span>
            </button>}
          </div>
        </nav>
        <NotificationBell signedIn={Boolean(session?.user)} />
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
                <a href={productHref(product)} key={`product-${product.id}`} onClick={() => { setSearchQuery(""); setMenuOpen(false); setSearchOpen(false); }}>
                  <span className="search-result-icon" aria-hidden="true">{product.name?.trim()?.charAt(0).toUpperCase() || "P"}</span><span>{product.name}<small>{product.brand || product.category || product.codeNumber}</small></span><span className="search-result-arrow"><Icon name="arrowUpRight" /></span>
                </a>
              ))}
              {matchingNavItems.map((item) => (
                <a href={item.href} key={`nav-${item.label}`} onClick={() => { setSearchQuery(""); setMenuOpen(false); setSearchOpen(false); }}>
                  <span className="search-result-icon"><Icon name={item.icon} /></span><span>{item.label}<small>Category</small></span><span className="search-result-arrow"><Icon name="arrowUpRight" /></span>
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
