import Link from "next/link";
import { categoryHref } from "@/lib/proxy-links";

// Same destinations as the header nav (proxy categories open the proxy store).
const categories = ["Discount Proxy Panel", "Monthly ISP Proxy", "Dedicated Servers", "Private Proxy", "Residential Static Proxy", "VPS"].map((label) => [label, categoryHref(label)]);

const usefulLinks = [
  ["Home", "/"],
  ["Shop", "/catalog"],
  ["About Us", "/#about"],
  ["Contact Us", "/#support"],
  ["Support", "/#support"],
];

const legalLinks = ["Return and Refund Policy", "Privacy Policy", "Terms and Conditions", "Terms of Service", "About Us"];

export function SiteFooter() {
  return (
    <footer className="site-footer" id="footer">
      <div className="footer-main">
        <div className="footer-brand-column">
          <Link className="footer-logo" href="/" aria-label="IP Dokan home"><img src="/ip-dokan-logo.svg" alt="IP Dokan" /></Link>
          <p>Trusted by thousands, delivering premium IP and proxy solutions with speed, security, and reliability.</p>
          <h2>Follow Us</h2>
          <div className="footer-social-links">
            <a className="footer-social-telegram" href="https://t.me/IpDokan" target="_blank" rel="noreferrer" aria-label="Follow IP Dokan on Telegram">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 4.2 18.4 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20.2 3c.9-.3 1.7.2 1.4 1.2Z" /></svg>
            </a>
            <a className="footer-social-facebook" href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="IP Dokan on Facebook">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.6V13h2.7v8h3.2Z" /></svg>
            </a>
            <a className="footer-social-instagram" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="IP Dokan on Instagram">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><circle cx="17.7" cy="6.8" r="1.1" fill="currentColor"/></svg>
            </a>
          </div>
        </div>
        <nav className="footer-column" aria-label="Product categories">
          <h2>Categories</h2>
          {categories.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}
        </nav>
        <nav className="footer-column" aria-label="Useful links">
          <h2>Useful Links</h2>
          {usefulLinks.map(([label, href]) => <Link href={href} key={label}>{label}</Link>)}
          <Link href="/wallet">My Wallet</Link>
        </nav>
        <nav className="footer-column" aria-label="Policies">
          <h2>Terms and<br />Conditions</h2>
          {legalLinks.map((label) => <a href="#footer" key={label}>{label}</a>)}
        </nav>
        <div className="footer-column footer-contact">
          <h2>Contact Us</h2>
          <a className="footer-contact-item" href="https://t.me/IpDokan" target="_blank" rel="noreferrer">
            <span className="footer-contact-icon telegram-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 4.2 18.4 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20.2 3c.9-.3 1.7.2 1.4 1.2Z" /></svg></span>
            <span><strong>Telegram</strong><small>@IpDokan</small></span>
          </a>
          <a className="footer-contact-item" href="mailto:admin@ipdokan.com">
            <span className="footer-contact-icon email-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M7 17 24 5l17 12v25H7V17Z" fill="#dce7ff" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="m7 18 17 13 17-13" fill="#fff" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/><path d="m7 42 13-13m21 13L28 29" stroke="currentColor" strokeWidth="2.5"/><circle cx="24" cy="20" r="7" fill="#fff" stroke="currentColor" strokeWidth="2.5"/><path d="M27 18a3 3 0 1 0-1 2.2V21c0 1.4 2 1.3 2 0v-1a5 5 0 1 0-2 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span>
            <span><strong>Email</strong><small>admin@ipdokan.com</small></span>
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <p>Based on <strong>IPdokan</strong> Copyright © {new Date().getFullYear()} IPDokan. All Rights Reserved.</p>
        <div className="footer-credit"><strong>Developed by <span className="footer-credit-brand">BytNext</span></strong><span>Software &amp; AI/ML Solutions</span></div>
        <div className="footer-protected" aria-label="Protected by Cloudflare and Sentry">
          <span className="footer-protected-label">Protected by</span>
          <span className="footer-protected-badge">
            <span className="footer-protected-logo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f6821f" d="M16.3 16.9c.15-.52.09-1-.17-1.35-.24-.32-.64-.5-1.12-.53l-9.1-.12a.18.18 0 0 1-.14-.08.18.18 0 0 1-.02-.16.24.24 0 0 1 .21-.16l9.18-.12c1.09-.05 2.27-.93 2.68-2l.53-1.37a.3.3 0 0 0 .01-.18 6.04 6.04 0 0 0-11.6-.62A2.72 2.72 0 0 0 2.5 12.9a2.7 2.7 0 0 0 .03.4c.01.06.06.1.12.1h11.27c.06 0 .11.04.13.1l.12.42Z"/><path fill="#fbad41" d="M19.3 10.56c-.08 0-.17 0-.25.01a.14.14 0 0 0-.12.1l-.36 1.25c-.15.52-.09 1 .17 1.35.24.32.64.5 1.12.53l1.94.12c.06 0 .11.03.14.08a.18.18 0 0 1 .02.16.24.24 0 0 1-.21.16l-2.02.12c-1.1.05-2.27.93-2.68 2l-.15.37c-.03.07.02.14.1.14h6.94c.06 0 .12-.04.13-.1a4.96 4.96 0 0 0-4.78-6.3Z"/></svg>
            </span>
            Cloudflare
          </span>
          <span className="footer-protected-badge">
            <span className="footer-protected-logo">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#362d59" d="M13.4 4.8a1.6 1.6 0 0 0-2.8 0l-2.2 3.8.9.52a11.5 11.5 0 0 1 5.65 9.18h-2.33a9.18 9.18 0 0 0-4.48-7.16l-1.1 1.9a7 7 0 0 1 3.4 5.26H4.03a.4.4 0 0 1-.35-.6l1.9-3.3a4.3 4.3 0 0 0-1.36-.78l-1.9 3.28A1.6 1.6 0 0 0 3.7 20.4h5.98a.5.5 0 0 0 .5-.5 8.2 8.2 0 0 0-3.88-7.32l1.1-1.9a10.33 10.33 0 0 1 4.9 9.22.5.5 0 0 0 .5.5h3.95a.5.5 0 0 0 .5-.52 13.6 13.6 0 0 0-6.5-11.3l1.07-1.86a.2.2 0 0 1 .35 0l8.1 14.02a.4.4 0 0 1-.35.6h-1.9c.02.42.03.85.02 1.27h1.88a1.6 1.6 0 0 0 1.4-2.4Z"/></svg>
            </span>
            Sentry
          </span>
        </div>
        <div className="footer-bottom-actions">
          <img className="footer-zinipay" src="/zinipay-1.webp" alt="ZiniPay" />
          <span className="footer-binance" aria-label="Binance Wallet supported">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 2 4.2 4.2L16 10.4l-4.2-4.2L16 2Zm-9.9 9.9 4.2 4.2-4.2 4.2-4.2-4.2 4.2-4.2Zm19.8 0 4.2 4.2-4.2 4.2-4.2-4.2 4.2-4.2ZM16 21.6l4.2 4.2L16 30l-4.2-4.2 4.2-4.2Zm0-9.7 4.2 4.2L16 20.3l-4.2-4.2 4.2-4.2Z" fill="currentColor" /></svg>
            <span><strong>BINANCE PAY</strong><small>Wallet supported</small></span>
          </span>
          <a href="#top" className="footer-back-top" aria-label="Back to top">↑</a>
        </div>
      </div>
    </footer>
  );
}
