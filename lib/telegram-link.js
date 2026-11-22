const telegramAppUrl = "tg://resolve?domain=ipdokanbot";
const telegramWebUrl = "https://t.me/ipdokanbot";

export function openTelegramBot(event) {
  if (typeof window === "undefined" || !/iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent)) return;
  event.preventDefault();
  let appOpened = false;
  const onVisibilityChange = () => {
    if (document.hidden) {
      appOpened = true;
      window.clearTimeout(fallbackTimer);
    }
  };
  const fallbackTimer = window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (!appOpened) window.location.assign(telegramWebUrl);
  }, 1500);
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.location.href = telegramAppUrl;
}
