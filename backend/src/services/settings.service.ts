/**
 * settings.service — runtime configuration store.
 *
 * Admin-editable settings persisted in the AppSetting table (one JSON row per
 * group). Code-level DEFAULTS below are the single source of truth for shape
 * and fallback values: a DB row only exists once an admin changes something,
 * and partial rows deep-merge over the defaults. Reads are served from an
 * in-process cache; writes invalidate it.
 *
 * Template strings support {{ticketId}}, {{days}}, {{dueDate}}, {{status}},
 * {{priority}}, {{portalName}} placeholders.
 */
import prisma from "../config/prisma.js";

export interface NotificationTemplate {
  subject: string;
  body: string;
}

export const SETTING_GROUPS = [
  "branding",
  "sla",
  "reports",
  "toggles",
  "templates",
] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

const DEFAULTS = {
  branding: {
    portalNameEn: "Wahid",
    portalNameAr: "واحد",
    fullNameEn: "Wahid Operations Portal",
    fullNameAr: "بوابة واحد للعمليات",
    taglineEn: "One unified portal for your operations — clear, fast, and accountable.",
    taglineAr: "بوابة موحدة لعملياتك — وضوح وسرعة ومساءلة.",
    logoUrl: "",
    primaryColor: "#2f80aa",
    emailSignature: "— Wahid Portal",
    emailButtonColor: "#0d6efd",
  },
  sla: {
    // Fallback warning window (days before due date) for entities without
    // their own slaWarningDays.
    defaultWarningDays: 3,
    checkerCron: "5 0 * * *",
  },
  reports: {
    weeklyEnabled: true,
    weeklyCron: "0 8 * * 0",
    weeklyRecipients: [] as string[],
  },
  toggles: {
    // null = follow the .env value; true/false = override from the UI.
    whatsapp: null as boolean | null,
    imap: null as boolean | null,
    oidc: null as boolean | null,
  },
  templates: {
    ASSIGNED: {
      subject: "You were assigned to ticket {{ticketId}}",
      body: "You're now the owner of ticket {{ticketId}}",
    },
    COMMENT_ADDED: {
      subject: "New comment on ticket {{ticketId}}",
      body: "Someone commented on ticket {{ticketId}}",
    },
    STATUS_CHANGED: {
      subject: "Ticket {{ticketId}} status changed",
      body: "Ticket {{ticketId}} status changed from {{from}} to {{to}}",
    },
    SLA_WARNING: {
      subject: "Ticket {{ticketId}} is due soon",
      body: "Ticket {{ticketId}} is due within {{days}} days",
    },
    SLA_OVERDUE: {
      subject: "Ticket {{ticketId}} is overdue",
      body: "Ticket {{ticketId}} is overdue",
    },
    ESCALATION: {
      subject: "Escalation: ticket {{ticketId}}",
      body: "Ticket {{ticketId}} has been overdue for more than {{days}} days",
    },
  } as Record<string, NotificationTemplate>,
};

export type AppSettings = typeof DEFAULTS;

let cache: AppSettings | null = null;

function deepMerge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) {
    return override as T;
  }
  const out: any = { ...base };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (k in out && typeof out[k] === "object" && out[k] !== null && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** Get the merged settings (defaults ⊕ DB overrides), cached. */
export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  const merged: any = structuredClone(DEFAULTS);
  try {
    const rows = await prisma.appSetting.findMany();
    for (const row of rows) {
      if (!(SETTING_GROUPS as readonly string[]).includes(row.key)) continue;
      try {
        merged[row.key] = deepMerge((DEFAULTS as any)[row.key], JSON.parse(row.value));
      } catch {
        /* corrupted row → keep defaults for that group */
      }
    }
  } catch (err) {
    console.error("[settings] load failed, using defaults:", err);
  }
  cache = merged as AppSettings;
  return cache;
}

/** Overwrite one group (stores the full group JSON) and refresh the cache. */
export async function updateSettingGroup(
  group: SettingGroup,
  value: unknown,
  updatedById?: string,
): Promise<AppSettings> {
  const merged = deepMerge((DEFAULTS as any)[group], value);
  await prisma.appSetting.upsert({
    where: { key: group },
    create: { key: group, value: JSON.stringify(merged), updatedById },
    update: { value: JSON.stringify(merged), updatedById },
  });
  cache = null;
  return getSettings();
}

/** Reset one group back to code defaults. */
export async function resetSettingGroup(group: SettingGroup): Promise<AppSettings> {
  await prisma.appSetting.deleteMany({ where: { key: group } });
  cache = null;
  return getSettings();
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/** The code-level defaults (used by the admin UI to show "default" hints). */
export function settingDefaults(): AppSettings {
  return structuredClone(DEFAULTS);
}

/** Render a template string, replacing {{var}} placeholders. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name) => {
    const v = vars[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** Resolve a notification template by type (falls back to a generic one). */
export async function getTemplate(type: string): Promise<NotificationTemplate> {
  const s = await getSettings();
  return (
    s.templates[type] ?? {
      subject: "Update on ticket {{ticketId}}",
      body: "Update on ticket {{ticketId}}",
    }
  );
}

/** Effective integration toggle: UI override if set, else the env flag. */
export async function toggleEnabled(
  name: "whatsapp" | "imap" | "oidc",
  envValue: boolean,
): Promise<boolean> {
  const s = await getSettings();
  const override = s.toggles[name];
  return override === null || override === undefined ? envValue : override;
}
