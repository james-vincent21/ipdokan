const benefits = [
  {
    icon: "⚡",
    title: "Instant Activation",
    text: "Get your proxy working in seconds. Connect and go.",
  },
  {
    icon: "🔒",
    title: "Private & Secure",
    text: "Reliable connections for your work, browsing, and projects.",
  },
  {
    icon: "✦",
    title: "Plans for Every Need",
    text: "Explore proxy and server options in one convenient place.",
  },
];

export function HeroSection() {
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-content">
        <span className="hero-kicker"><span className="status-dot" /> YOUR CONNECTION, YOUR WAY</span>
        <h1 id="hero-title">Find the right IP.<br /><span>Get more done.</span></h1>
        <p className="hero-description">
          Explore proxy and server solutions built for speed, privacy, and
          reliability. Choose what works for you with IP DOKAN.
        </p>

        <div className="hero-tags" aria-label="Services">
          <span>ISP Proxy</span><span>Private Proxy</span><span>Residential</span>
          <span>Dedicated Servers</span><span>VPS</span>
        </div>

        <div className="hero-actions">
          <a className="button button-primary" href="#products">Explore services <span aria-hidden="true">→</span></a>
          <a className="button button-secondary" href="#support"><span aria-hidden="true">◉</span> Get support</a>
        </div>

        <div className="trust-row">
          <span className="trust-mark">IP<span>D</span></span>
          <span>One place for your proxy essentials</span>
          <span className="trust-divider" />
          <span className="trust-highlight">Simple. Reliable. Ready.</span>
        </div>

        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.title}>
              <span className="benefit-icon" aria-hidden="true">{benefit.icon}</span>
              <div><h2>{benefit.title}</h2><p>{benefit.text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
