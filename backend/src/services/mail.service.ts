import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config/env.js";

let transporter: Transporter | null = null;
let logged = false;

function getTransporter(): Transporter | null {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
    if (!logged) {
      console.log("[Mail] SMTP not configured — emails disabled");
      logged = true;
    }
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
    console.log(`[Mail] Transporter ready (${config.SMTP_HOST}:${config.SMTP_PORT})`);
  }
  return transporter;
}

interface SendArgs {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email. No-ops (logs and returns) when SMTP is not configured —
 * we never want a missing email config to break a request flow.
 */
export async function sendEmail(args: SendArgs): Promise<void> {
  const t = getTransporter();
  if (!t) return;

  const from = config.SMTP_FROM || `Wahid Portal <${config.SMTP_USER}>`;
  try {
    await t.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
      replyTo: config.SMTP_REPLY_TO || undefined,
    });
  } catch (err) {
    console.error("[Mail] sendEmail failed:", (err as Error).message);
  }
}

/** Build the absolute URL to a ticket detail page in the frontend. */
export function ticketUrl(ticketId: string): string {
  const base = config.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/tickets/${ticketId}`;
}

interface NotifyArgs {
  toEmail: string;
  toName: string;
  subject: string;
  /** A short headline shown prominently. */
  headline: string;
  /** One or two sentences of context. */
  body: string;
  ticketDisplayId: string;
  ticketId: string;
}

/**
 * Send a notification email about a ticket — used for assignment, comments,
 * status changes, SLA warnings, and escalations.
 */
export async function sendNotificationEmail(args: NotifyArgs): Promise<void> {
  const url = ticketUrl(args.ticketId);
  const text = `${args.headline}\n\n${args.body}\n\nTicket ${args.ticketDisplayId}: ${url}\n\n— Wahid Portal`;
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px;">
    <p style="font-size:18px;font-weight:600;margin:0 0 8px;">${escapeHtml(args.headline)}</p>
    <p style="margin:0 0 20px;color:#444;line-height:1.5;">${escapeHtml(args.body)}</p>
    <p style="margin:0 0 24px;">
      <a href="${url}" style="display:inline-block;background:#0d6efd;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:500;">Open ticket ${escapeHtml(args.ticketDisplayId)}</a>
    </p>
    <p style="font-size:12px;color:#888;margin:0;">Hi ${escapeHtml(args.toName)} — this is an automated message from the Wahid Portal.</p>
  </body></html>`;
  await sendEmail({ to: args.toEmail, subject: args.subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
