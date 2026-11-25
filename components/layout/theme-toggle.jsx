"use client";

import { useLayoutEffect } from "react";
import { Icon } from "@/components/ui/icons";

export const THEME_KEY = "ipdokan-theme";

// Runs in <head> before the page is painted. A ?theme=light|dark link also sets (and saves) the theme.
// Light is the default; a saved choice wins.
export const DEFAULT_THEME = "light";
export const THEME_SCRIPT = `(function(){try{var k="${THEME_KEY}",q=new URLSearchParams(location.search).get("theme");if(q==="light"||q==="dark")localStorage.setItem(k,q);var t=localStorage.getItem(k);document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){}})()`;

// Both icons are rendered; CSS shows the sun in dark mode and the moon in light mode, so the server
// HTML and the browser always match whatever theme the head script chose.
export function ThemeToggle() {
  // In development React's Strict Mode remount resets <html> attributes; put the saved theme back before paint.
  useLayoutEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* storage blocked */ }
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggle() {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: the choice lasts for this page only */ }
  }

  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Switch between light and dark mode" title="Light / dark mode">
    <span className="theme-toggle-sun"><Icon name="sun" /></span>
    <span className="theme-toggle-moon"><Icon name="moon" /></span>
  </button>;
}
