"use client";

import { openTelegramBot } from "@/lib/telegram-link";
import { Icon } from "@/components/ui/icons";

export function TelegramBotCta() {
  return (
    <section className="telegram-bot-cta" aria-labelledby="telegram-bot-title">
      <div className="telegram-bot-inner">
        <div className="telegram-bot-copy">
          <span className="telegram-bot-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 4.2 18.4 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.3L5.8 13.5.9 12c-1.1-.3-1.1-1 .2-1.5L20.2 3c.9-.3 1.7.2 1.4 1.2Z" /></svg> Telegram Bot</span>
          <h2 id="telegram-bot-title">Use our service from any device with our Telegram bot</h2>
          <p>Find IPDokan on Telegram and get in touch with our team wherever you are.</p>
          <a className="telegram-bot-button" href="https://t.me/ipdokanbot" onClick={openTelegramBot}>Go to bot <Icon name="arrowUpRight" /></a>
        </div>
        <div className="telegram-device-scene" aria-hidden="true">
          <div className="telegram-device">
            <div className="telegram-device-status"><span>9:41</span><span>●●●　 LTE　 ▰</span></div>
            <div className="telegram-device-nav"><span>‹</span><span>IPDokan</span><span>···</span></div>
            <div className="telegram-profile">
              <span className="telegram-profile-logo"><img src="/ip.png" alt="" /></span>
              <strong>IPDokan Proxy Store</strong>
              <small>Telegram support</small>
            </div>
            <div className="telegram-profile-actions"><span>Message</span><span>Mute</span><span>More</span></div>
            <div className="telegram-info-card">
              <small>username</small><strong>@IpDokan</strong>
              <hr />
              <small>about</small><p>IP and proxy services for your work. Message us for help with plans and setup.</p>
            </div>
            <div className="telegram-device-button">Message</div>
          </div>
          <span className="telegram-scene-orb telegram-scene-orb-one" />
          <span className="telegram-scene-orb telegram-scene-orb-two" />
        </div>
      </div>
    </section>
  );
}
