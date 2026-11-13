const requestPath = "M105 90 C265 95 390 195 600 210 C800 225 925 115 1090 90";
const networkPath = "M105 390 C270 300 420 260 600 250 C790 240 905 335 1090 400";

const benefits = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m13.2 2.8-8 11h6.1l-.6 7.4 8.1-11h-6.2l.6-7.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
    title: "Instant Activation",
    text: "Get your proxy working in seconds. Connect and go.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="10" width="14" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: "Private & Secure",
    text: "Reliable connections for your work, browsing, and projects.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 8h8M8 12h3m2 0h3m-8 4h3m2 0h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
    title: "Plans for Every Need",
    text: "Explore proxy and server options in one convenient place.",
  },
];

export function HeroSection() {
  return (
    <section className="hero" id="home" aria-labelledby="hero-title">
      <div className="network-scene" aria-hidden="true">
        <div className="network-orb orb-one" />
        <div className="network-orb orb-two" />
        <div className="globe-wrap">
          <svg className="globe" viewBox="0 0 300 300" fill="none">
            <defs>
              <radialGradient id="globe-fill" cx="35%" cy="28%" r="78%">
                <stop offset="0" stopColor="#3985ff" stopOpacity=".2" />
                <stop offset=".75" stopColor="#184994" stopOpacity=".08" />
                <stop offset="1" stopColor="#0c1d3c" stopOpacity=".02" />
              </radialGradient>
              <clipPath id="globe-clip"><circle cx="150" cy="150" r="119" /></clipPath>
            </defs>
            <circle cx="150" cy="150" r="119" fill="url(#globe-fill)" stroke="#6daaff" strokeOpacity=".34" />
            <g className="globe-grid" clipPath="url(#globe-clip)">
              <ellipse cx="150" cy="150" rx="48" ry="119" />
              <ellipse cx="150" cy="150" rx="91" ry="119" />
              <ellipse cx="150" cy="150" rx="119" ry="42" />
              <ellipse cx="150" cy="150" rx="119" ry="82" />
              <path d="M31 150h238M42 104h216M42 196h216" />
              <path className="globe-continent" d="m82 83 21-17 27 4 8 14 22 4 13 18-12 13 8 14-18 14-4 21-19 4-11-15-16-3-7-21-16-7-6-22-13-9 3-12Zm93 91 15-10 18 8 5 18 16 12-8 17-18-5-7-16-15-7-6-17Z" />
            </g>
            <circle cx="150" cy="150" r="122" stroke="#7bb6ff" strokeOpacity=".1" strokeDasharray="2 7" />
          </svg>
        </div>
        <svg className="network-lines" viewBox="0 0 1200 500" preserveAspectRatio="none">
          <defs>
            <linearGradient id="link-gradient" x1="0" x2="1" y1="0" y2="1">
              <stop className="link-start" offset="0" stopColor="#4285ff" stopOpacity="0" />
              <stop className="link-middle" offset=".5" stopColor="#5b9aff" stopOpacity=".8" />
              <stop className="link-end" offset="1" stopColor="#36d9ff" stopOpacity="0" />
            </linearGradient>
            <filter id="link-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <ellipse className="orbit orbit-one" cx="600" cy="250" rx="205" ry="83" transform="rotate(-17 600 250)" />
          <ellipse className="orbit orbit-two" cx="600" cy="250" rx="166" ry="118" transform="rotate(58 600 250)" />
          <path className="route route-request" d={requestPath} />
          <path className="route route-network" d={networkPath} />
          <circle className="packet packet-a" r="4">
            <animateMotion dur="5.5s" repeatCount="indefinite" calcMode="paced" path={requestPath} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.07;.88;1" dur="5.5s" repeatCount="indefinite" />
          </circle>
          <circle className="packet packet-a packet-trail" r="3">
            <animateMotion dur="5.5s" begin="-2.75s" repeatCount="indefinite" calcMode="paced" path={requestPath} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.07;.88;1" dur="5.5s" begin="-2.75s" repeatCount="indefinite" />
          </circle>
          <circle className="packet packet-b" r="3.5">
            <animateMotion dur="6.5s" repeatCount="indefinite" calcMode="paced" path={networkPath} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.07;.88;1" dur="6.5s" repeatCount="indefinite" />
          </circle>
          <circle className="packet packet-b packet-trail" r="2.7">
            <animateMotion dur="6.5s" begin="-3.25s" repeatCount="indefinite" calcMode="paced" path={networkPath} />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.07;.88;1" dur="6.5s" begin="-3.25s" repeatCount="indefinite" />
          </circle>
        </svg>
        <div className="network-node node-server">
          <span className="node-caption">SERVER</span>
          <span className="server-rack"><i /><i /><i /></span>
        </div>
        <div className="network-node node-internet">
          <span className="node-caption">NETWORK</span>
          <span className="internet-symbol" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M4 11.5a18 18 0 0 1 24 0M8.5 16a11.5 11.5 0 0 1 15 0M12.5 20a5.5 5.5 0 0 1 7 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="16" cy="25" r="1.8" fill="currentColor" />
            </svg>
          </span>
        </div>
        <div className="network-node node-isp">
          <span className="benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21V12m0 0 4-6m-4 6L8 6m4 15H7m5 0h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.2 8.4a9 9 0 0 1 13.6 0M8.2 11a5 5 0 0 1 7.6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="12" cy="4" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="node-caption">ISP PROXY</span>
        </div>
        <div className="network-node node-proxy">
          <span className="node-caption">PROXY</span>
          <span className="proxy-symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="4" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
              <rect x="13.5" y="14" width="7" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M10.5 7h2a3 3 0 0 1 3 3v4M13.5 17h-2a3 3 0 0 1-3-3v-4m0 0 2 2m-2-2-2 2m9 4-2-2m2 2 2-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-content">
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
              <span className="benefit-icon">{benefit.icon}</span>
              <div><h2>{benefit.title}</h2><p>{benefit.text}</p></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
