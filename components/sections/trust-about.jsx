const features = [
  { icon: <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 8c7 6 14 8 22 9v13c0 13-8 22-22 28C18 52 10 43 10 30V17c8-1 15-3 22-9Z" fill="#fff" stroke="#536394" strokeWidth="2.4" strokeLinejoin="round"/><path d="M24 29v15h-6V29h6Zm0 2 8-11c1-2 4-1 4 1 0 2-1 4-2 6h9c3 0 4 3 2 5 2 2 1 4-1 5 1 2-1 4-3 4h-9c-3 0-5-1-8-2" stroke="#536394" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: "Ultra-Fast & Reliable", text: "Enjoy 99.9% uptime and lag-free browsing with our optimized servers." },
  { icon: <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M32 8c7 6 14 8 22 9v13c0 13-8 22-22 28C18 52 10 43 10 30V17c8-1 15-3 22-9Z" fill="#fff" stroke="#171a25" strokeWidth="2.2" strokeLinejoin="round"/><path d="M21 20c4-1 8-3 11-6 4 3 8 5 13 6l-2 13c-2 7-6 11-11 14-6-4-10-9-11-16l-1-11Z" stroke="#171a25" strokeWidth="1.8" strokeLinejoin="round"/><circle cx="31" cy="31" r="7" fill="#536394" stroke="#171a25" strokeWidth="2"/><path d="M29 31v-2a2 2 0 0 1 4 0v2m-5 0h6v5h-6z" stroke="#171a25" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="47" cy="40" r="8" fill="#536394" stroke="#171a25" strokeWidth="2"/><path d="m43 40 3 3 5-6" stroke="#171a25" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: "Total Privacy & Security", text: "Protect your identity with encrypted and anonymous connections." },
  { icon: <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M20 11a23 23 0 0 1 30 32M13 22a23 23 0 0 1 3-7m37 26a23 23 0 0 1-6 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="m17 9 5 1-2 5M47 49l-5-1 2-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="35" cy="29" r="15" fill="#536394" stroke="#171a25" strokeWidth="2"/><path d="M20 29h30M35 14c-5 5-7 10-7 15s2 10 7 15m0-30c5 5 7 10 7 15s-2 10-7 15M24 20h22M24 38h19" stroke="#171a25" strokeWidth="1.7"/><path d="m17 34 10 3v9c0 6-5 10-10 13-5-3-10-7-10-13v-9l10-3Z" fill="#f5f5f7" stroke="#171a25" strokeWidth="2" strokeLinejoin="round"/><path d="m13 45 3 3 5-6" stroke="#536394" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>, title: "All Global Coverage", text: "Get access to proxies from multiple locations around the world." },
  { icon: <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="25" r="17" fill="#536394" stroke="#171a25" strokeWidth="2.4"/><path d="M15 25h34M32 8c-6 6-9 11-9 17s3 12 9 17m0-34c6 6 9 11 9 17s-3 12-9 17M20 14h24M17 36h30" stroke="#111522" strokeWidth="2.2" strokeLinecap="round"/><path d="M32 42v8m-17 0h34" stroke="#171a25" strokeWidth="2.5" strokeLinecap="round"/><path d="M29 48h6v7h-6z" fill="#e6a94d" stroke="#171a25" strokeWidth="2"/><path d="M10 46c-2 2-2 5 0 7m3-6c-1 1-1 3 0 4m41-5c2 2 2 5 0 7m-3-6c1 1 1 3 0 4" stroke="#171a25" strokeWidth="2" strokeLinecap="round"/></svg>, title: "Flexible Proxy Options", text: "Choose from Residential, ISP, and dedicated proxy plans." },
];

export function TrustAbout() {
  return (
    <section className="trust-about" id="about" aria-labelledby="trust-about-title">
      <div className="trust-about-inner">
        <div className="trust-feature-grid">
          {features.map((feature) => (
            <article className="trust-feature" key={feature.title}>
              <span className="trust-feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
        <div className="trust-about-copy">
          <h2 id="trust-about-title">IPDokan – Your Trusted Source for Premium Personal IPs &amp; Proxies!</h2>
          <p>At IPDokan, we are committed to providing top-tier Premium Personal IP and Proxy solutions to ensure your online security, privacy, and unrestricted access to the digital world. Our mission is to empower individuals and businesses with fast, secure, and reliable IP solutions, enabling seamless browsing and protection against cyber threats.</p>
          <p>With a focus on innovation, performance, and customer satisfaction, IPDokan delivers high-quality dedicated and shared proxies tailored for various use cases, including secure browsing, streaming, gaming, and data protection. We partner with trusted networks to offer global coverage, high-speed connections, and 100% anonymity for our users.</p>
          <p>Whether you’re a professional, a business, or just someone looking to enhance their online privacy, IPDokan is your go-to solution for the best proxy services. Join us today and experience the next level of secure internet access!</p>
        </div>
      </div>
    </section>
  );
}
