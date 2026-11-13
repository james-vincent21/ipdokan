"use client";

import { useEffect, useState } from "react";

const topics = [
  { label: "Proxy plans", href: "#products" },
  { label: "ISP proxy", href: "#isp" },
  { label: "Servers & VPS", href: "#servers" },
];

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <div className="support-chat">
      {isOpen && (
        <section className="chat-panel" id="support-chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <header className="chat-header">
            <span className="chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v7a3.5 3.5 0 0 1-3.5 3.5H11l-4 3v-3.5A3.5 3.5 0 0 1 5 12.5v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><path d="M9 12.5c1.8 1.4 4.2 1.4 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </span>
            <div><h2 id="chat-title">IP DOKAN Support</h2><span className="chat-status">How can we help?</span></div>
            <button className="chat-close" type="button" aria-label="Close chat" onClick={() => setIsOpen(false)}>×</button>
          </header>
          <div className="chat-body">
            <p className="chat-greeting">Hi! What would you like help with today?</p>
            <div className="chat-topics">
              {topics.map((topic) => <a href={topic.href} key={topic.label} onClick={() => setIsOpen(false)}>{topic.label}<span aria-hidden="true">→</span></a>)}
            </div>
            <a className="chat-contact" href="#support" onClick={() => setIsOpen(false)}>Contact support <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      )}
      <div className="support-chat-actions">
        <div className="support-social-links" aria-label="Message us">
            <a className="support-social support-social-telegram" href="https://telegram.org/" target="_blank" rel="noreferrer" aria-label="Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 4.2 18.4 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20.2 3c.9-.3 1.7.2 1.4 1.2Z" /></svg></a>
            <a className="support-social support-social-whatsapp" href="https://www.whatsapp.com/" target="_blank" rel="noreferrer" aria-label="WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a9.7 9.7 0 0 0-8.3 14.7L2.4 22l5.5-1.4A9.8 9.8 0 1 0 12 2Zm0 17.7a7.9 7.9 0 0 1-4-1.1l-.3-.2-3.3.9.9-3.2-.2-.3A7.9 7.9 0 1 1 12 19.7Zm4.3-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.4-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4c.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.4 3.8 3.3.5.2.9.4 1.2.5.5.1.9.1 1.3.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1 0-.1-.2-.2-.4-.3Z" /></svg></a>
        </div>
        <button className="chat-launcher" type="button" aria-label={isOpen ? "Close support chat" : "Open support chat"} aria-expanded={isOpen} aria-controls="support-chat-panel" onClick={() => setIsOpen(!isOpen)}>
          <span className="chat-launcher-disc">{isOpen ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a9.2 9.2 0 1 0 5.9 16.3l2.7 1-1-2.8A9.2 9.2 0 0 0 12 2.8Z" fill="currentColor" /></svg>}</span>
        </button>
      </div>
    </div>
  );
}
