const categories = [
  ["Discount proxy panel", "#discount"],
  ["Monthly ISP Proxy", "#isp"],
  ["Dedicated Servers", "#servers"],
  ["Private Proxy", "#private-proxy"],
  ["Residential Static Proxy", "#residential"],
  ["VPS", "#vps"],
];

const usefulLinks = [
  ["Home", "#home"],
  ["Shop", "#products"],
  ["About Us", "#about"],
  ["Contact Us", "#support"],
  ["Support", "#support"],
];

const legalLinks = ["Return and Refund Policy", "Privacy Policy", "Terms and Conditions", "Terms of Service", "About Us"];

export function SiteFooter() {
  return (
    <footer className="site-footer" id="footer">
      <div className="footer-main">
        <div className="footer-brand-column">
          <a className="footer-logo" href="#home" aria-label="IP Dokan home"><img src="/ip-dokan-logo.svg" alt="IP Dokan" /></a>
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
          {categories.map(([label, href]) => <a href={href} key={label}>{label}</a>)}
        </nav>
        <nav className="footer-column" aria-label="Useful links">
          <h2>Useful Links</h2>
          {usefulLinks.map(([label, href]) => <a href={href} key={label}>{label}</a>)}
          <a href="#support">My Wallet</a>
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
        <div className="footer-bottom-actions">
          <img className="footer-zinipay" src="/zinipay-1.webp" alt="ZiniPay" />
          <a href="#home" className="footer-back-top" aria-label="Back to top">↑</a>
        </div>
      </div>
    </footer>
  );
}
