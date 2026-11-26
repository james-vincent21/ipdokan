// Reads the device type, browser and operating system from a User-Agent header, for the admin activity log.
// Best effort: browsers can report anything here.
export function parseUserAgent(userAgent = "") {
  const ua = String(userAgent);
  const version = (pattern) => (ua.match(pattern)?.[1] || "").replace(/_/g, ".").split(".").slice(0, 2).join(".");

  let browser = "Unknown browser";
  if (/TelegramBot|bot|crawler|spider/i.test(ua)) browser = "Bot";
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = `Edge ${version(/Edg(?:e|A|iOS)?\/([\d.]+)/)}`;
  else if (/OPR\/|Opera/.test(ua)) browser = `Opera ${version(/(?:OPR|Opera)\/([\d.]+)/)}`;
  else if (/SamsungBrowser\//.test(ua)) browser = `Samsung Internet ${version(/SamsungBrowser\/([\d.]+)/)}`;
  else if (/YaBrowser\//.test(ua)) browser = `Yandex ${version(/YaBrowser\/([\d.]+)/)}`;
  else if (/UCBrowser\//.test(ua)) browser = `UC Browser ${version(/UCBrowser\/([\d.]+)/)}`;
  else if (/FBAN|FBAV/.test(ua)) browser = "Facebook app";
  else if (/Instagram/.test(ua)) browser = "Instagram app";
  else if (/CriOS\//.test(ua)) browser = `Chrome ${version(/CriOS\/([\d.]+)/)}`;
  else if (/FxiOS\//.test(ua)) browser = `Firefox ${version(/FxiOS\/([\d.]+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${version(/Firefox\/([\d.]+)/)}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${version(/Chrome\/([\d.]+)/)}`;
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${version(/Version\/([\d.]+)/)}`;

  let os = "Unknown OS";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6\.1/.test(ua)) os = "Windows 7";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/iPad/.test(ua)) os = `iPadOS ${version(/OS ([\d_]+)/)}`;
  else if (/iPhone|iPod/.test(ua)) os = `iOS ${version(/OS ([\d_]+)/)}`;
  else if (/Android/.test(ua)) os = `Android ${version(/Android ([\d.]+)/)}`;
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X/.test(ua)) os = `macOS ${version(/Mac OS X ([\d_]+)/)}`;
  else if (/Linux/.test(ua)) os = "Linux";

  let device = "Desktop";
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua)) device = "Mobile";

  return { device, browser: browser.trim(), os: os.trim() };
}
