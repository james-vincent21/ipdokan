// Outgoing email over SMTP (Gmail with an app password). Emails are normally sent by the worker
// (backend/worker.js) from the "email" queue; see lib/queue.js.
import nodemailer from "nodemailer";
import { config } from "../config/env.js";

let transport = null;
function getTransport() {
  if (!config.mailEnabled) throw new Error("Email is not configured (SMTP_USER / SMTP_PASS).");
  transport ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.port === 465,
    auth: { user: config.mail.user, pass: config.mail.pass },
    pool: true,
    maxConnections: 3,
  });
  return transport;
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const OTP_SUBJECTS = {
  "email-verification": "Your IP Dokan verification code",
  "sign-in": "Your IP Dokan sign-in code",
  "forget-password": "Your IP Dokan password reset code",
  "change-email": "Your IP Dokan email change code",
};

export function otpEmail({ email, otp, type }) {
  const subject = OTP_SUBJECTS[type] || OTP_SUBJECTS["email-verification"];
  const code = escapeHtml(otp);
  return {
    to: email,
    subject: `${subject}: ${otp}`,
    text: `Your IP Dokan code is ${otp}\n\nIt expires in 5 minutes. If you did not ask for it, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:440px;margin:auto;padding:24px;color:#1b1f27">
  <h2 style="margin:0 0 12px">IP Dokan</h2>
  <p style="margin:0 0 18px">Use this code to verify your email address:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 18px;color:#1f4fd6">${code}</p>
  <p style="margin:0;color:#5b6170;font-size:13px">It expires in 5 minutes. If you did not ask for it, you can ignore this email.</p>
</div>`,
  };
}

export async function sendMail(message) {
  await getTransport().sendMail({ from: config.mail.from, ...message });
}
