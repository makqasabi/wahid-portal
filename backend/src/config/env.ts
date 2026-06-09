import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(import.meta.dirname, "../../.env") });

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function flag(key: string): boolean {
  const v = (process.env[key] ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

const OIDC_ISSUER = optional("OIDC_ISSUER", "");
const OIDC_CLIENT_ID = optional("OIDC_CLIENT_ID", "");
const WHATSAPP_PHONE_NUMBER_ID = optional("WHATSAPP_PHONE_NUMBER_ID", "");
const WHATSAPP_ACCESS_TOKEN = optional("WHATSAPP_ACCESS_TOKEN", "");
const IMAP_HOST = optional("IMAP_HOST", "");
const IMAP_USER = optional("IMAP_USER", "");

export const config = {
  PORT: parseInt(optional("PORT", "3001"), 10),
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),

  // When true, ENTITY_ADMIN/SUPER_ADMIN cannot log in until they enrol in 2FA.
  // Default OFF — enrol admins first, then enable, to avoid lockout.
  ENFORCE_ADMIN_MFA: flag("ENFORCE_ADMIN_MFA"),

  // ── Outbound email (SMTP) ──────────────────────────────────
  SMTP_HOST: optional("SMTP_HOST", ""),
  SMTP_PORT: parseInt(optional("SMTP_PORT", "587"), 10),
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),
  SMTP_FROM: optional("SMTP_FROM", ""),
  SMTP_REPLY_TO: optional("SMTP_REPLY_TO", ""),

  // ── Inbound email (IMAP) ───────────────────────────────────
  // Polls a mailbox and turns matching messages into ticket comments.
  // Auto-enabled once host + user + pass are present (or force with IMAP_ENABLED).
  IMAP_ENABLED: flag("IMAP_ENABLED") || (!!IMAP_HOST && !!IMAP_USER),
  IMAP_HOST,
  IMAP_PORT: parseInt(optional("IMAP_PORT", "993"), 10),
  IMAP_USER,
  IMAP_PASS: optional("IMAP_PASS", ""),
  IMAP_TLS: process.env.IMAP_TLS ? flag("IMAP_TLS") : true,
  IMAP_MAILBOX: optional("IMAP_MAILBOX", "INBOX"),
  IMAP_POLL_SECONDS: parseInt(optional("IMAP_POLL_SECONDS", "60"), 10),

  // ── Microsoft / OIDC single sign-on ────────────────────────
  // Provider-agnostic OpenID Connect — works with Entra ID or ADFS (OIDC)
  // by pointing OIDC_ISSUER at the discovery base URL.
  OIDC_ENABLED: flag("OIDC_ENABLED") || (!!OIDC_ISSUER && !!OIDC_CLIENT_ID),
  OIDC_ISSUER, // e.g. https://login.microsoftonline.com/<tenant>/v2.0
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET: optional("OIDC_CLIENT_SECRET", ""),
  OIDC_REDIRECT_URI: optional("OIDC_REDIRECT_URI", ""),
  OIDC_SCOPES: optional("OIDC_SCOPES", "openid profile email"),
  // If true, a successful SSO login for an unknown email is rejected;
  // when false you could later auto-provision. Kept strict by default.
  OIDC_ALLOW_SIGNUP: flag("OIDC_ALLOW_SIGNUP"),

  // ── WhatsApp Cloud API ─────────────────────────────────────
  // Sends automated messages on the same triggers as email notifications.
  WHATSAPP_ENABLED:
    flag("WHATSAPP_ENABLED") || (!!WHATSAPP_PHONE_NUMBER_ID && !!WHATSAPP_ACCESS_TOKEN),
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_API_VERSION: optional("WHATSAPP_API_VERSION", "v21.0"),
  // Default country code (digits only, no +) prepended to local numbers.
  WHATSAPP_DEFAULT_COUNTRY_CODE: optional("WHATSAPP_DEFAULT_COUNTRY_CODE", ""),
  // Business-initiated messages (outside the 24h window) require an approved
  // template. When a template name is set, notifications send as a template
  // with the message text as the first body parameter; otherwise free-form text.
  WHATSAPP_TEMPLATE_NAME: optional("WHATSAPP_TEMPLATE_NAME", ""),
  WHATSAPP_TEMPLATE_LANG: optional("WHATSAPP_TEMPLATE_LANG", "en"),

  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:5173"),
  UPLOAD_DIR: optional("UPLOAD_DIR", "./uploads"),
} as const;
