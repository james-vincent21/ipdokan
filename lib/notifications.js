// Notification helpers shared by the header bell and the /notifications page.
import { useSyncExternalStore } from "react";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SOUND_KEY = "ipdokan-notify-sound";
const LAST_PING_KEY = "ipdokan-notify-last-ping";
// Fired after the read state changes, so the bell and the page stay in step.
export const NOTIFICATIONS_CHANGED = "ipdokan-notifications-changed";

export async function fetchNotifications({ before, unreadOnly, limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  if (unreadOnly) params.set("unread", "1");
  const response = await fetch(`${apiUrl}/api/notifications?${params}`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Could not load notifications.");
  return response.json();
}

// Returns the new unread count.
export async function setRead(id, read) {
  const response = await fetch(`${apiUrl}/api/notifications/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read }) });
  if (!response.ok) throw new Error("Could not update the notification.");
  const result = await response.json();
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { id, read, unread: result.unread } }));
  return result.unread;
}

export async function markAllRead() {
  const response = await fetch(`${apiUrl}/api/notifications/read`, { method: "POST", credentials: "include" });
  if (!response.ok) throw new Error("Could not update notifications.");
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: { all: true, unread: 0 } }));
}

export function timeAgo(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(value).toLocaleDateString();
}

export function soundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}

const SOUND_CHANGED = "ipdokan-notify-sound-changed";

export function setSoundEnabled(on) {
  try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(SOUND_CHANGED));
}

// [on, setOn]: the sound setting, the same in every component and tab (the server render assumes on).
export function useSoundSetting() {
  const on = useSyncExternalStore((callback) => {
    window.addEventListener(SOUND_CHANGED, callback);
    window.addEventListener("storage", callback);
    return () => { window.removeEventListener(SOUND_CHANGED, callback); window.removeEventListener("storage", callback); };
  }, soundEnabled, () => true);
  return [on, setSoundEnabled];
}

// Short two-note ping made with Web Audio (no sound file). Browsers allow sound only after the visitor has
// clicked or tapped the page once, so the audio context is unlocked on the first interaction.
let audioContext = null;
function context() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ||= new AudioContextClass();
  return audioContext;
}

export function unlockSound() {
  const unlock = () => { context()?.resume().catch(() => {}); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playPing({ force = false, id = "" } = {}) {
  if (!force && !soundEnabled()) return;
  // With several tabs open, only the first tab to see a notification plays the sound.
  if (id) {
    try { if (localStorage.getItem(LAST_PING_KEY) === id) return; localStorage.setItem(LAST_PING_KEY, id); } catch { /* storage blocked */ }
  }
  const ctx = context();
  if (!ctx) return;
  // `force` is a click (the sound toggle), which is allowed to start audio.
  if (ctx.state !== "running") { if (force) ctx.resume().then(() => beep(ctx)).catch(() => {}); return; }
  beep(ctx);
}

function beep(ctx) {
  const start = ctx.currentTime;
  [[880, 0], [1318.5, 0.11]].forEach(([frequency, offset]) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.34);
  });
}
