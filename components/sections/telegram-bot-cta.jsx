"use client";

import { useEffect, useRef, useState } from "react";
import { openTelegramBot } from "@/lib/telegram-link";
import { Icon } from "@/components/ui/icons";

// Every "Support" link points at /#support. Content above this section (products, images) keeps
// loading after the browser's first jump, which leaves the page short of the section, so for a couple
// of seconds after arriving at #support we keep scrolling it to the top as the page grows.
function useScrollToSupport(ref) {
  useEffect(() => {
    let observer = null;
    let timer = 0;
    function follow() {
      const section = ref.current;
      if (!section || window.location.hash !== "#support") return;
      observer?.disconnect();
      clearTimeout(timer);
      const align = () => section.scrollIntoView({ behavior: "smooth", block: "start" });
      align();
      observer = new ResizeObserver(align);
      observer.observe(document.body);
      timer = setTimeout(() => observer?.disconnect(), 2500);
    }
    // A link to #support while the address already ends in #support fires no hashchange: handle the click.
    function onClick(event) {
      const link = event.target instanceof Element ? event.target.closest("a[href$='#support']") : null;
      if (!link || new URL(link.href).pathname !== window.location.pathname) return;
      event.preventDefault();
      if (window.location.hash !== "#support") {
        window.history.pushState(null, "", "#support");
        window.dispatchEvent(new HashChangeEvent("hashchange")); // the nav marks Support as current
      } else follow();
    }
    follow();
    window.addEventListener("hashchange", follow);
    document.addEventListener("click", onClick);
    return () => {
      observer?.disconnect();
      clearTimeout(timer);
      window.removeEventListener("hashchange", follow);
      document.removeEventListener("click", onClick);
    };
  }, [ref]);
}

// The phone animation plays only while the section is on screen (and not at all with reduced motion,
// which shows the bot's profile instead).
function usePlayWhenVisible(ref) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const observer = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return playing;
}

// Made-up chats for the phone animation.
const SAMPLE_CHATS = [
  ["Saved Messages", "Proxy list.txt", "9:30", "#3b82f6"],
  ["Design Team", "New banner is ready", "9:12", "#a855f7"],
  ["Family", "Dinner at 8?", "8:47", "#f97316"],
  ["Crypto News", "Market update for today", "8:20", "#14b8a6"],
  ["Work Group", "Meeting moved to 3 pm", "Tue", "#ef4444"],
  ["Football Fans", "What a goal! ⚽", "Mon", "#22c55e"],
  ["Travel Deals", "Flights from ৳15,000", "Sun", "#eab308"],
  ["Book Club", "Next book: Atomic Habits", "Sat", "#ec4899"],
  ["Gym Buddies", "Leg day tomorrow 💪", "Fri", "#6366f1"],
  ["Weather Bot", "Sunny, 31°C in Dhaka", "Thu", "#0ea5e9"],
];

function SearchGlyph() {
  return <svg className="tg-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
}

export function TelegramBotCta() {
  const sectionRef = useRef(null);
  useScrollToSupport(sectionRef);
  const playing = usePlayWhenVisible(sectionRef);
  return (
    <section className="telegram-bot-cta" id="support" ref={sectionRef} aria-labelledby="telegram-bot-title">
      <div className="telegram-bot-inner">
        <div className="telegram-bot-copy">
          <span className="telegram-bot-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 4.2 18.4 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20.2 3c.9-.3 1.7.2 1.4 1.2Z" /></svg> Telegram Bot</span>
          <h2 id="telegram-bot-title">Use our service from any device with our Telegram bot</h2>
          <p>Find IPDokan on Telegram and get in touch with our team wherever you are.</p>
          <a className="telegram-bot-button" href="https://t.me/ipdokanbot" onClick={openTelegramBot}>Go to bot <Icon name="arrowUpRight" /></a>
        </div>
        <div className="telegram-device-scene" aria-hidden="true">
          <div className={`telegram-device${playing ? " is-playing" : ""}`}>
            {/* iPhone 17-style hardware: side buttons, screen with Dynamic Island, status bar, home bar */}
            <span className="iphone-button iphone-action" />
            <span className="iphone-button iphone-volume-up" />
            <span className="iphone-button iphone-volume-down" />
            <span className="iphone-button iphone-power" />
            <span className="iphone-button iphone-camera-control" />
            <div className="iphone-screen">
            <span className="iphone-island" />
            <div className="telegram-device-status">
              <span>9:41</span>
              <span className="iphone-status-icons">
                <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
                <svg viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.7 10.7 0 0 0 8 .4C5.2.4 2.5 1.5.5 3.4l1.2 1.3A9 9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.2 7.2 0 0 0 8 4c-1.8 0-3.6.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.5c-.6 0-1.2.2-1.6.6L8 11.6l1.6-1.7c-.4-.4-1-.6-1.6-.6Z" /></svg>
                <svg viewBox="0 0 27 12"><rect x=".5" y=".5" width="23" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45" /><rect x="2" y="2" width="20" height="8" rx="2" /><path d="M25 4v4c.8-.3 1.4-1.1 1.4-2S25.8 4.3 25 4Z" opacity=".45" /></svg>
              </span>
            </div>
            <div className="tg-screens">
              {/* 1. The chat list scrolls, then the search bar is tapped */}
              <div className="tg-screen tg-screen-list">
                <div className="tg-list-head"><span>Edit</span><strong>Chats</strong><span>✎</span></div>
                <div className="tg-search tg-search-tap"><SearchGlyph /><span>Search</span><i className="tg-tap" /></div>
                <div className="tg-list"><div className="tg-list-scroll">
                  {SAMPLE_CHATS.map(([name, text, time, color]) => (
                    <div className="tg-row" key={name}><span className="tg-avatar" style={{ background: color }}>{name.charAt(0)}</span><span className="tg-row-text"><strong>{name}</strong><small>{text}</small></span><time>{time}</time></div>
                  ))}
                </div></div>
              </div>
              {/* 2. "ipdokanbot" is typed and the bot is picked from the results */}
              <div className="tg-screen tg-screen-search">
                <div className="tg-search is-active"><SearchGlyph /><span className="tg-typed">ipdokanbot</span><span className="tg-caret" /><span className="tg-cancel">Cancel</span></div>
                <small className="tg-section-label">Chats and bots</small>
                <div className="tg-row tg-result"><span className="tg-avatar tg-avatar-bot"><img src="/ip.png" alt="" loading="lazy" decoding="async" /></span><span className="tg-row-text"><strong>IPDokan Proxy Store</strong><small>@ipdokanbot · bot</small></span><i className="tg-tap" /></div>
              </div>
              {/* 3. The bot's profile; "Message" is tapped */}
              <div className="tg-screen tg-screen-profile">
                <div className="telegram-device-nav"><span>‹</span><span>IPDokan</span><span>···</span></div>
                <div className="telegram-profile">
                  <span className="telegram-profile-logo"><img src="/ip.png" alt="" loading="lazy" decoding="async" /></span>
                  <strong>IPDokan Proxy Store</strong>
                  <small>Telegram support</small>
                </div>
                <div className="telegram-profile-actions"><span className="tg-message-tap">Message<i className="tg-tap" /></span><span>Mute</span><span>More</span></div>
                <div className="telegram-info-card">
                  <small>username</small><strong>@ipdokanbot</strong>
                  <hr />
                  <small>about</small><p>IP and proxy services for your work. Message us for help with plans and setup.</p>
                </div>
                <div className="telegram-device-button">Message</div>
              </div>
              {/* 4. The chat with the bot opens: /start and the welcome menu */}
              <div className="tg-screen tg-screen-chat">
                <div className="tg-chat-head"><span className="tg-back">‹</span><span className="tg-avatar tg-avatar-bot"><img src="/ip.png" alt="" loading="lazy" decoding="async" /></span><span className="tg-row-text"><strong>IPDokan Proxy Store</strong><small>bot</small></span></div>
                <div className="tg-messages">
                  <p className="tg-bubble tg-out tg-msg-1">/start</p>
                  <p className="tg-bubble tg-in tg-msg-2">👋 Welcome to IPDokan Proxy Store!</p>
                  <p className="tg-bubble tg-in tg-msg-3">Buy proxies, check your orders and get support right here.</p>
                  <div className="tg-keyboard tg-msg-4"><span>🛒 Buy proxy</span><span>📦 My orders</span><span>💰 Wallet</span><span>💬 Support</span></div>
                </div>
              </div>
            </div>
            <span className="iphone-home-indicator" />
            </div>
          </div>
          <span className="telegram-scene-orb telegram-scene-orb-one" />
          <span className="telegram-scene-orb telegram-scene-orb-two" />
        </div>
      </div>
    </section>
  );
}
