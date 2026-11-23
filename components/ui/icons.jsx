// One consistent line-icon set (24×24, 1.8 stroke, currentColor) used across the site.
const paths = {
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  discount: <><path d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1.06.44l6.9 6.9a1.5 1.5 0 0 1 0 2.12l-7.6 7.6a1.5 1.5 0 0 1-2.12 0l-6.9-6.9a1.5 1.5 0 0 1-.44-1.06Z" /><path d="m9.5 14.5 5-5" /><circle cx="9.75" cy="9.75" r=".9" /><circle cx="14.25" cy="14.25" r=".9" /></>,
  layers: <><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5" /><path d="m3 16.5 9 4.5 9-4.5" /></>,
  wifi: <><path d="M2.5 9a14 14 0 0 1 19 0" /><path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" /><path d="M8.7 16a5 5 0 0 1 6.6 0" /><path d="M12 19.5h.01" /></>,
  shield: <><path d="M12 3c2.6 2.1 5.3 3 8 3.2v5.3c0 4.6-3.2 7.9-8 9.5-4.8-1.6-8-4.9-8-9.5V6.2C6.7 6 9.4 5.1 12 3Z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></>,
  home: <><path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1v-9.5Z" /></>,
  server: <><rect x="3.5" y="3.5" width="17" height="7" rx="2" /><rect x="3.5" y="13.5" width="17" height="7" rx="2" /><path d="M7.5 7h.01M7.5 17h.01M11.5 7h5M11.5 17h5" /></>,
  cloud: <><path d="M7 19h10.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.6 9.5 4.75 4.75 0 0 0 7 19Z" /></>,
  support: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4.5" height="6" rx="1.5" /><rect x="16.5" y="13" width="4.5" height="6" rx="1.5" /><path d="M18.75 19v.5a2.5 2.5 0 0 1-2.5 2.5H13" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  cart: <><path d="M3 4h2.2l2.3 11.2a1.5 1.5 0 0 0 1.47 1.2h8.6a1.5 1.5 0 0 0 1.46-1.15L20.5 8H6.1" /><circle cx="9.5" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 16.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86L12 3.5Z" />,
  package: <><path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9L12 3Z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>,
};

export function Icon({ name, className = "", size }) {
  const content = paths[name] || paths.package;
  return <svg className={`ui-icon${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" width={size || "1em"} height={size || "1em"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{content}</svg>;
}
