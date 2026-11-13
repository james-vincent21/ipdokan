"use client";

import { useState } from "react";

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

  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="#home" aria-label="IP DOKAN home">
          <span className="brand-icon" aria-hidden="true"><span>IP</span></span>
          <span>IP <strong>DOKAN</strong></span>
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
        </nav>
        <a className="sign-in" href="#support">Sign in <span aria-hidden="true">↗</span></a>
      </div>
    </header>
  );
}
