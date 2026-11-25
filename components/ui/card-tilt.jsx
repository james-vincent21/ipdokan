"use client";

import { useEffect } from "react";

// 3D product cards: while the mouse is over a card, the card tilts toward the pointer.
// One listener for the whole page (cards rendered later are covered too); it only sets two CSS
// variables per frame, and the tilt itself is drawn in CSS (see "3D product cards" in globals.css).
const CARDS = ".popular-product-card, .store-product-card, .proxy-plan-card, .proxy-type-card";
const MAX_TILT = 8; // degrees

export function CardTilt() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let active = null;
    let frame = 0;
    let pending = null;

    const reset = (card) => { card.style.removeProperty("--tilt-x"); card.style.removeProperty("--tilt-y"); card.classList.remove("is-tilting"); };

    function onMove(event) {
      if (event.pointerType !== "mouse") return;
      const card = event.target instanceof Element ? event.target.closest(CARDS) : null;
      if (card !== active) { if (active) reset(active); active = card; }
      if (!card) return;
      pending = { card, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0;
        const { card: c, x, y } = pending;
        const box = c.getBoundingClientRect();
        const px = (x - box.left) / box.width - 0.5; // -0.5 … 0.5
        const py = (y - box.top) / box.height - 0.5;
        c.style.setProperty("--tilt-x", `${(-py * MAX_TILT * 2).toFixed(2)}deg`);
        c.style.setProperty("--tilt-y", `${(px * MAX_TILT * 2).toFixed(2)}deg`);
        c.classList.add("is-tilting");
      });
    }
    function onLeave() { if (active) reset(active); active = null; }

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);
  return null;
}
