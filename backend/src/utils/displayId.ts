import { prismaUnscoped } from "../config/prisma.js";

const PREFIX = "WAH-";

/**
 * Generates the next sequential display ID for a ticket.
 * Format: WAH-0001, WAH-0002, ...
 *
 * Uses the unscoped client so soft-deleted tickets still occupy their IDs —
 * audit logs reference displayId and we don't want collisions.
 */
export async function generateDisplayId(): Promise<string> {
  const lastTicket = await prismaUnscoped.ticket.findFirst({
    orderBy: { displayId: "desc" },
    select: { displayId: true },
  });

  let nextNumber = 1;

  if (lastTicket?.displayId) {
    const suffix = lastTicket.displayId.replace(PREFIX, "");
    const parsed = parseInt(suffix, 10);
    if (!isNaN(parsed)) {
      nextNumber = parsed + 1;
    }
  }

  const padded = String(nextNumber).padStart(4, "0");
  return `${PREFIX}${padded}`;
}
