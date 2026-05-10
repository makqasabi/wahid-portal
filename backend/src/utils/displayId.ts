import type { PrismaClient } from "@prisma/client";

const PREFIX = "WAH-";

/**
 * Generates the next sequential display ID for a ticket.
 * Format: WAH-0001, WAH-0002, ...
 *
 * Queries the current max displayId, parses the numeric suffix,
 * increments it, and zero-pads to 4 digits.
 */
export async function generateDisplayId(prisma: PrismaClient): Promise<string> {
  const lastTicket = await prisma.ticket.findFirst({
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
