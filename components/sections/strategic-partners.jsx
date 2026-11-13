const partners = [
  { name: "AT&T Business", src: "https://commons.wikimedia.org/wiki/Special:FilePath/AT%26T_logo_2016.svg", business: true },
  { name: "Verizon", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Verizon_2015_logo_-vector.svg" },
  { name: "AT&T", src: "https://commons.wikimedia.org/wiki/Special:FilePath/AT%26T_logo_2016.svg" },
  { name: "T-Mobile", src: "https://commons.wikimedia.org/wiki/Special:FilePath/T-Mobile_US_Logo_2022_RGB_Magenta_on_Transparent.svg" },
  { name: "Charter Spectrum", src: "https://commons.wikimedia.org/wiki/Special:FilePath/Charter_Spectrum_logo.svg" },
];

export function StrategicPartners() {
  return (
    <section className="strategic-partners" aria-labelledby="strategic-partners-title">
      <div className="strategic-partners-inner">
        <h2 id="strategic-partners-title">Strategic Partnerships<br />for Better Solutions</h2>
        <div className="partner-logo-list">
          {partners.map((partner) => <div className="partner-logo" key={partner.name}><img src={partner.src} alt={partner.name} />{partner.business && <span className="partner-business-label">Business</span>}</div>)}
        </div>
      </div>
    </section>
  );
}
