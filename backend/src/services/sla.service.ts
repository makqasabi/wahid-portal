import prisma from "../config/prisma.js";
import { calcCalendarDays } from "../utils/businessDays.js";

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
 * Find all tickets past their due date that are still IN_PROGRESS
 * and mark them as DELAYED. Creates audit log entries.
 */
export async function checkAndUpdateDelayed(): Promise<number> {
  const now = new Date();

  const overdueTickets = await prisma.ticket.findMany({
    where: {
      dueDate: { lt: now },
      progress: { notIn: ["COMPLETED", "ON_HOLD", "DEPENDENT", "DELAYED"] },
    },
    select: { id: true, ownerId: true },
  });

  if (overdueTickets.length === 0) return 0;

  // Batch update all overdue tickets
  await prisma.ticket.updateMany({
    where: {
      id: { in: overdueTickets.map((t) => t.id) },
    },
    data: { progress: "DELAYED" },
  });

  // Create audit logs for each
  await prisma.auditLog.createMany({
    data: overdueTickets.map((t) => ({
      ticketId: t.id,
      userId: t.ownerId, // attribute to the owner
      action: "STATUS_CHANGED",
      fieldName: "progress",
      oldValue: "IN_PROGRESS",
      newValue: "DELAYED",
    })),
  });

  return overdueTickets.length;
}
