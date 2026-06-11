/**
 * workflow.service — dynamic ticket statuses & priorities.
 *
 * Statuses/priorities live in the TicketStatus / TicketPriority tables and are
 * fully admin-editable (labels, colors, ordering, allowed transitions). The
 * engine (SLA checker, dashboards, ticket routes) never references a specific
 * status key — it asks this service for keys by SEMANTIC FLAG:
 *   isDefault     → status given to new tickets
 *   isClosed      → terminal; sets closureDate + SLA variance
 *   pausesSla     → excluded from overdue/auto-delay checks
 *   isOverdueFlag → the status overdue tickets get auto-moved to
 *
 * On boot, seedWorkflowIfEmpty() inserts the historical defaults so existing
 * ticket rows (which store the same keys) keep working unchanged.
 */
import prisma from "../config/prisma.js";
import type { TicketStatus, TicketPriority } from "@prisma/client";

let statusCache: TicketStatus[] | null = null;
let priorityCache: TicketPriority[] | null = null;

const SEED_STATUSES = [
  {
    key: "IN_PROGRESS", name: "قيد التنفيذ", nameEn: "In Progress",
    color: "#0ea5e9", sortOrder: 0, isDefault: true,
    transitionsTo: ["COMPLETED", "ON_HOLD", "DEPENDENT"],
  },
  {
    key: "DELAYED", name: "متأخر", nameEn: "Delayed",
    color: "#f43f5e", sortOrder: 1, isOverdueFlag: true,
    transitionsTo: ["COMPLETED", "ON_HOLD", "IN_PROGRESS"],
  },
  {
    key: "COMPLETED", name: "مكتمل", nameEn: "Completed",
    color: "#10b981", sortOrder: 2, isClosed: true,
    transitionsTo: ["IN_PROGRESS"],
  },
  {
    key: "ON_HOLD", name: "قيد الانتظار", nameEn: "On Hold",
    color: "#94a3b8", sortOrder: 3, pausesSla: true,
    transitionsTo: ["IN_PROGRESS"],
  },
  {
    key: "DEPENDENT", name: "معلق على آخر", nameEn: "Dependent",
    color: "#f97316", sortOrder: 4, pausesSla: true,
    transitionsTo: ["IN_PROGRESS"],
  },
];

const SEED_PRIORITIES = [
  { key: "CRITICAL", name: "حرج", nameEn: "Critical", color: "#e11d48", sortOrder: 0 },
  { key: "HIGH", name: "عالي", nameEn: "High", color: "#f59e0b", sortOrder: 1 },
  { key: "MEDIUM", name: "متوسط", nameEn: "Medium", color: "#64748b", sortOrder: 2, isDefault: true },
  { key: "LOW", name: "منخفض", nameEn: "Low", color: "#94a3b8", sortOrder: 3 },
];

/** Insert the historical statuses/priorities if the tables are empty. */
export async function seedWorkflowIfEmpty(): Promise<void> {
  try {
    if ((await prisma.ticketStatus.count()) === 0) {
      for (const s of SEED_STATUSES) {
        await prisma.ticketStatus.create({
          data: { ...s, transitionsTo: JSON.stringify(s.transitionsTo) },
        });
      }
      console.log("[workflow] seeded default ticket statuses");
    }
    if ((await prisma.ticketPriority.count()) === 0) {
      for (const p of SEED_PRIORITIES) {
        await prisma.ticketPriority.create({ data: p });
      }
      console.log("[workflow] seeded default ticket priorities");
    }
  } catch (err) {
    console.error("[workflow] seeding failed:", err);
  }
}

export function invalidateWorkflowCache(): void {
  statusCache = null;
  priorityCache = null;
}

/** All statuses (including inactive), ordered — for the admin UI. */
export async function getAllStatuses(): Promise<TicketStatus[]> {
  if (!statusCache) {
    statusCache = await prisma.ticketStatus.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return statusCache;
}

export async function getActiveStatuses(): Promise<TicketStatus[]> {
  return (await getAllStatuses()).filter((s) => s.isActive);
}

export async function getAllPriorities(): Promise<TicketPriority[]> {
  if (!priorityCache) {
    priorityCache = await prisma.ticketPriority.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return priorityCache;
}

export async function getActivePriorities(): Promise<TicketPriority[]> {
  return (await getAllPriorities()).filter((p) => p.isActive);
}

// ── Semantic lookups used by the engine ─────────────────────

export async function defaultStatusKey(): Promise<string> {
  const all = await getActiveStatuses();
  return (all.find((s) => s.isDefault) ?? all[0])?.key ?? "IN_PROGRESS";
}

export async function defaultPriorityKey(): Promise<string> {
  const all = await getActivePriorities();
  return (all.find((p) => p.isDefault) ?? all[0])?.key ?? "MEDIUM";
}

/** Keys of statuses that mean "ticket is finished". */
export async function closedStatusKeys(): Promise<string[]> {
  return (await getAllStatuses()).filter((s) => s.isClosed).map((s) => s.key);
}

/** Keys counted as "open" for dashboards: not closed, not SLA-paused. */
export async function openStatusKeys(): Promise<string[]> {
  return (await getAllStatuses())
    .filter((s) => !s.isClosed && !s.pausesSla)
    .map((s) => s.key);
}

/** Keys of statuses that pause SLA tracking (ON_HOLD-like). */
export async function pausedStatusKeys(): Promise<string[]> {
  return (await getAllStatuses()).filter((s) => s.pausesSla).map((s) => s.key);
}

/** The status overdue tickets are auto-moved to (and counted as overdue). */
export async function overdueStatusKey(): Promise<string | null> {
  return (await getAllStatuses()).find((s) => s.isOverdueFlag)?.key ?? null;
}

/** Statuses eligible for the overdue sweep: open + the overdue status itself. */
export async function overdueCandidateKeys(): Promise<string[]> {
  return (await getAllStatuses())
    .filter((s) => !s.isClosed && !s.pausesSla)
    .map((s) => s.key);
}

export async function isValidStatusKey(key: string): Promise<boolean> {
  return (await getActiveStatuses()).some((s) => s.key === key);
}

export async function isValidPriorityKey(key: string): Promise<boolean> {
  return (await getActivePriorities()).some((p) => p.key === key);
}

export async function isClosedStatus(key: string): Promise<boolean> {
  return (await closedStatusKeys()).includes(key);
}

/** Is `to` an allowed transition from `from`? (Unknown `from` → allow.) */
export async function canTransition(from: string, to: string): Promise<boolean> {
  if (from === to) return true;
  const all = await getAllStatuses();
  const fromStatus = all.find((s) => s.key === from);
  if (!fromStatus) return true; // legacy/unknown current status: don't trap the ticket
  try {
    const allowed: string[] = JSON.parse(fromStatus.transitionsTo);
    return allowed.includes(to);
  } catch {
    return true;
  }
}
