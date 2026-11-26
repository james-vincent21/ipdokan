"use client";

import { useEffect, useMemo, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DISMISSED_KEY = "ipdokan:review-prompt-dismissed";
// Only fresh purchases are asked for a rating; older ones never trigger the pop-up.
const ASK_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
const RATING_WORDS = ["", "Very poor", "Poor", "Okay", "Good", "Excellent!"];
const RATING_EMOJI = ["", "😞", "😕", "🙂", "😊", "🤩"];

function readDismissed() {
  try { return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || "[]")); }
  catch { return new Set(); }
}

function rememberDismissed(productId) {
  try {
    const list = [...readDismissed(), String(productId)].slice(-200);
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
  } catch { /* storage blocked: the pop-up may show again next visit */ }
}

const hasCodes = (order) => Boolean(order.deliveredCodes?.length || order.deliveredCode);

// After a purchase's code arrives, asks the buyer for a star rating and feedback, then thanks them.
// One pop-up per product, never again once rated or closed.
export function PurchaseReviewPopup({ orders }) {
  // Only mounted in the browser (after the profile loads), so localStorage can be read straight away.
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [now] = useState(() => Date.now());
  const [readyId, setReadyId] = useState("");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thanked, setThanked] = useState(null);

  const order = useMemo(() => {
    return orders.find((item) => item.status === "paid" && hasCodes(item) && !item.deliveryPending && !item.reviewed
      && !dismissed.has(String(item.productId)) && now - new Date(item.paidAt || item.createdAt).getTime() < ASK_WITHIN_MS) || null;
  }, [orders, dismissed, now]);

  // A short pause, so the buyer sees their code on the page before the pop-up opens.
  useEffect(() => {
    if (!order) return undefined;
    const timer = window.setTimeout(() => setReadyId(String(order.id)), 1400);
    return () => window.clearTimeout(timer);
  }, [order]);

  function close() {
    const productId = thanked?.productId || order?.productId;
    if (productId) rememberDismissed(productId);
    setDismissed(readDismissed());
    setThanked(null); setRating(0); setHover(0); setComment(""); setError("");
  }

  useEffect(() => {
    if (!(order && readyId === String(order.id)) && !thanked) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !busy) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function submit(event) {
    event.preventDefault();
    if (!rating) return setError("Tap a star to rate your purchase.");
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/products/${order.productId}/reviews`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment: comment.trim() }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) throw new Error(result.error || "Could not send your feedback. Please try again.");
      setThanked({ productId: order.productId, productName: order.productName, rating });
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (thanked) return <div className="search-overlay review-popup-overlay" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="review-popup is-thanks" role="dialog" aria-modal="true" aria-labelledby="review-thanks-title">
      <div className="review-popup-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <i key={index} />)}</div>
      <span className="review-popup-badge is-thanks" aria-hidden="true">💚</span>
      <h2 id="review-thanks-title">Thank you so much!</h2>
      <p>Your {thanked.rating}-star feedback for <strong>{thanked.productName}</strong> means a lot to us. It helps other buyers choose with confidence and helps us keep improving IP DOKAN.</p>
      <p className="review-popup-sub">Enjoy your purchase — we&apos;re always here on Telegram if you need anything.</p>
      <button type="button" className="auth-submit review-popup-done" onClick={close}>You&apos;re welcome</button>
    </div>
  </div>;

  if (!order || readyId !== String(order.id)) return null;
  const shown = hover || rating;
  return <div className="search-overlay review-popup-overlay" onClick={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
    <form className="review-popup" role="dialog" aria-modal="true" aria-labelledby="review-popup-title" onSubmit={submit}>
      <button type="button" className="search-modal-close review-popup-close" aria-label="Close" disabled={busy} onClick={close}>×</button>
      <span className="review-popup-badge" aria-hidden="true">🎉</span>
      <span className="search-modal-kicker">YOUR CODE IS READY</span>
      <h2 id="review-popup-title">Enjoying your purchase?</h2>
      <p>Your <strong>{order.productName}{order.variantName ? ` · ${order.variantName}` : ""}</strong> has been delivered. How was your experience?</p>
      <div className="review-popup-stars" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} role="radio" aria-checked={rating === value} aria-label={`${value} star${value > 1 ? "s" : ""}`} className={value <= shown ? "is-on" : ""} onMouseEnter={() => setHover(value)} onClick={() => { setRating(value); setError(""); }}>★</button>)}
      </div>
      <p className="review-popup-word" aria-live="polite">{shown ? <>{RATING_EMOJI[shown]} {RATING_WORDS[shown]}</> : "Tap a star to rate"}</p>
      <label className="review-popup-feedback"><span>Feedback <small>(optional)</small></span>
        <textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Tell us what you liked or what we can do better…" />
      </label>
      {error && <p className="review-popup-error" role="alert">{error}</p>}
      <div className="review-popup-actions">
        <button type="button" className="admin-secondary" disabled={busy} onClick={close}>Maybe later</button>
        <button type="submit" className="auth-submit" disabled={busy}>{busy ? "Sending…" : "Submit feedback"}</button>
      </div>
    </form>
  </div>;
}
