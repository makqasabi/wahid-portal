import { config } from "../config/env.js";
import { toggleEnabled } from "./settings.service.js";

/**
 * WhatsApp Cloud API sender.
 *
 * Mirrors mail.service: a no-op (logs and returns) when not configured, so a
 * missing WhatsApp setup never breaks a request flow. Account credentials
 * (phone number id + access token) are supplied later via env.
 *
 * NOTE on delivery: business-initiated messages outside WhatsApp's 24-hour
 * customer-service window must use an approved *template*. Set
 * WHATSAPP_TEMPLATE_NAME to send notifications as a template (recommended for
 * automated triggers); otherwise free-form text is sent (only delivered inside
 * an open 24h session).
 */

let logged = false;

function ready(): boolean {
  if (config.WHATSAPP_ENABLED) return true;
  if (!logged) {
    console.log("[WhatsApp] not configured — messages disabled");
    logged = true;
  }
  return false;
}

/** Normalize a phone number to the digits-only E.164 form the API expects. */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (config.WHATSAPP_DEFAULT_COUNTRY_CODE) {
    // local number — prepend the configured country code
    digits = config.WHATSAPP_DEFAULT_COUNTRY_CODE + digits.replace(/^0+/, "");
  }
  return digits.length >= 8 ? digits : null;
}

async function post(body: unknown): Promise<boolean> {
  const url = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[WhatsApp] send failed (${res.status}): ${text.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[WhatsApp] send error:", (err as Error).message);
    return false;
  }
}

/** Send a free-form text message (only delivered inside an open 24h session). */
export async function sendText(to: string, text: string): Promise<boolean> {
  if (!ready()) return false;
  const phone = normalizePhone(to);
  if (!phone) return false;
  return post({
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

/**
 * Send an approved template message. `bodyParams` fill the {{1}}, {{2}}… body
 * placeholders in order. Use for business-initiated automated notifications.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  lang: string,
  bodyParams: string[] = [],
): Promise<boolean> {
  if (!ready()) return false;
  const phone = normalizePhone(to);
  if (!phone) return false;
  return post({
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      ...(bodyParams.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParams.map((t) => ({ type: "text", text: t })),
              },
            ],
          }
        : {}),
    },
  });
}

/**
 * High-level helper used by the notification triggers. Picks template vs text
 * automatically based on config. Safe to call unconditionally — no-ops when
 * WhatsApp is disabled or the recipient has no phone.
 */
export async function notifyWhatsApp(
  toPhone: string | null | undefined,
  message: string,
): Promise<boolean> {
  if (!(await toggleEnabled("whatsapp", config.WHATSAPP_ENABLED)) || !toPhone) return false;
  if (config.WHATSAPP_TEMPLATE_NAME) {
    return sendTemplate(
      toPhone,
      config.WHATSAPP_TEMPLATE_NAME,
      config.WHATSAPP_TEMPLATE_LANG,
      [message],
    );
  }
  return sendText(toPhone, message);
}
