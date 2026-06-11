import prisma from "../config/prisma.js";
import { calcCalendarDays } from "../utils/businessDays.js";
import { overdueStatusKey, openStatusKeys } from "./workflow.service.js";

/**
 * Calculate SLA variance in calendar days.
 * Negative = completed early, Positive = completed late, null if either date is missing.
 */
export function calculateSlaVariance(
  dueDate: Date | null | undefined,
  closureDate: Date | null | undefined,
): number | null {
  if (!dueDate || !closureDate) return null;
  const days = calcCalendarDays(dueDate, closureDate);
  // If closureDate > dueDate, variance is positive (late)
  return closureDate.getTime() > dueDate.getTime() ? days : -days;
}

/**
 * Find all tickets past their due date that are still in an open (non-closed,
 * non-SLA-paused) status and move them to the workflow's overdue status.
 * Status semantics come from the dynamic workflow tables. Creates audit logs.
 */
export async function checkAndUpdateDelayed(): Promise<number> {
  const now = new Date();
  const [overdueKey, openKeys] = await Promise.all([
    overdueStatusKey(),
    openStatusKeys(),
  ]);
  // No status flagged as "overdue" → the sweep is effectively disabled.
  if (!overdueKey) return 0;

  const overdueTickets = await prisma.ticket.findMany({
    where: {
      dueDate: { lt: now },
      progress: { in: openKeys.filter((k) => k !== overdueKey) },
    },
    select: { id: true, ownerId: true, progress: true },
  });

  if (overdueTickets.length === 0) return 0;

  // Batch update all overdue tickets
  await prisma.ticket.updateMany({
    where: {
      id: { in: overdueTickets.map((t) => t.id) },
    },
    data: { progress: overdueKey },
  });

  // Create audit logs for each
  await prisma.auditLog.createMany({
    data: overdueTickets.map((t) => ({
      ticketId: t.id,
      userId: t.ownerId, // attribute to the owner
      action: "STATUS_CHANGED",
      fieldName: "progress",
      oldValue: t.progress,
      newValue: overdueKey,
    })),
  });

  return overdueTickets.length;
}
