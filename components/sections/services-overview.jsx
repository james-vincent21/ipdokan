const services = [
  {
    title: "Residential Proxies",
    description: "Get ISP-assigned IPs with reliable trust scores for everyday browsing and location-aware work.",
    icon: <><rect x="8" y="4" width="16" height="5" rx="1"/><rect x="8" y="11" width="16" height="5" rx="1"/><rect x="8" y="18" width="16" height="5" rx="1"/><path d="M4 27h24M12 9h8m-8 7h8m-8 7h8"/></>,
  },
  {
    title: "Datacenter Proxies",
    description: "Fast, cost-effective connections for workloads that need consistent performance and scale.",
    icon: <><rect x="7" y="9" width="18" height="16" rx="2"/><path d="M11 13h2m6 0h2m-10 7h2m6 0h2M16 9V4m-7 5V5m14 4V5M16 25v4m-7-4v4m14-4v4M4 17H2m28 0h-2"/><circle cx="16" cy="17" r="1"/></>,
  },
  {
    title: "Dedicated Private IPs",
    description: "Use an IP reserved for you, with more control, privacy, and a stable connection.",
    icon: <><rect x="4" y="5" width="24" height="17" rx="2"/><path d="M12 27h8m-4-5v5M16 9v7m-3-4h6"/><circle cx="16" cy="13" r="5"/></>,
  },
  {
    title: "Rotating & Static Proxies",
    description: "Choose rotating IPs for regular address changes or static IPs for a consistent connection.",
    icon: <><circle cx="16" cy="16" r="11"/><path d="M16 5v22M5 16h22M8 8c5 5 11 11 16 16M24 8C19 13 13 19 8 24"/><path d="m21 5 3 3-4 1M11 27l-3-3 4-1"/></>,
  },
  {
    title: "Flexible Proxy Plans",
    description: "Compare proxy types and plan lengths to find an option that fits your needs.",
    icon: <><path d="M5 10h22M5 16h22M5 22h22"/><circle cx="12" cy="10" r="2"/><circle cx="21" cy="16" r="2"/><circle cx="14" cy="22" r="2"/></>,
  },
  {
    title: "Global Coverage",
    description: "Access IP locations in multiple regions for smoother, location-specific connectivity.",
    icon: <><circle cx="16" cy="16" r="12"/><path d="M4 16h24M16 4c4 4 6 8 6 12s-2 8-6 12m0-24c-4 4-6 8-6 12s2 8 6 12M8 8h16M8 24h16"/></>,
  },
];

export function ServicesOverview() {
  return (
    <section className="services-overview" aria-labelledby="services-overview-title">
      <div className="services-overview-inner">
        <header className="services-overview-heading">
          <span className="section-eyebrow"><span /> WHAT WE OFFER</span>
          <h2 id="services-overview-title">Our Services</h2>
          <p>At <strong>IPDokan</strong>, we provide premium personal IP and proxy solutions built for security, speed, and privacy. Explore the options and choose what suits your work.</p>
        </header>
        <div className="services-overview-grid">
          {services.map((service, index) => (
            <article className="overview-service-card" key={service.title}>
              <span className="overview-service-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none">{service.icon}</svg></span>
              <div><h3>{service.title}</h3><p>{service.description}</p></div>
              <span className="overview-service-number" aria-hidden="true">0{index + 1}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
