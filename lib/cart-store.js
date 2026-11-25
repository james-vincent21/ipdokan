// The one shopping cart of the site (browser storage), shared by the proxy store, checkout and header.
// Every change is announced to the page (and to other tabs through the "storage" event); when the
// customer is signed in, lib/realtime-client.js also sends it to the server so other devices get it.
export const CART_KEY = "ipdokan-cart-v1";
const STAMP_KEY = "ipdokan-cart-updated";
const EVENT = "ipdokan-cart";
let sendToServer = null;

const validLine = (item) => item && typeof item.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0;

export function readCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(validLine) : [];
  } catch { return []; }
}

export function cartStamp() {
  try { return Number(window.localStorage.getItem(STAMP_KEY)) || 0; } catch { return 0; }
}

// Saves the cart. Throws if the browser blocks storage (callers show a message).
export function writeCart(items, { stamp = Date.now(), fromServer = false } = {}) {
  const lines = (Array.isArray(items) ? items : []).filter(validLine);
  window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
  window.localStorage.setItem(STAMP_KEY, String(stamp));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { items: lines } }));
  if (!fromServer) sendToServer?.(lines, stamp);
  return lines;
}

export const cartCount = (items) => items.reduce((sum, item) => sum + (item.quantity || 0), 0);

// Calls back with the new cart whenever it changes here, in another tab, or on another device.
export function onCartChange(callback) {
  const onLocal = (event) => callback(event.detail.items);
  const onStorage = (event) => { if (event.key === CART_KEY) callback(readCart()); };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onLocal); window.removeEventListener("storage", onStorage); };
}

export function setCartSender(sender) { sendToServer = sender; }
