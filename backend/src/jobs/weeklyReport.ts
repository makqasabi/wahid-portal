import cron from "node-cron";
import prisma from "../config/prisma.js";

/**
 * Schedule the weekly report generation.
 * Runs every Sunday at 08:00.
 */
export function scheduleWeeklyReport(): void {
  cron.schedule("0 8 * * 0", async () => {
    console.log("[Weekly Report] Generating...");

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

      const entities = await prisma.entity.findMany({
        select: { id: true, name: true },
      });

      for (const entity of entities) {
        const scope = { ownerEntityId: entity.id };

        const [open, overdue, completedThisWeek, topOverdue] = await Promise.all([
          prisma.ticket.count({
            where: { ...scope, progress: { in: ["IN_PROGRESS", "DELAYED"] } },
          }),
          prisma.ticket.count({
            where: { ...scope, progress: "DELAYED" },
          }),
          prisma.ticket.count({
            where: {
              ...scope,
              progress: "COMPLETED",
              closureDate: { gte: weekAgo },
            },
          }),
          prisma.ticket.findMany({
            where: {
              ...scope,
              progress: "DELAYED",
              dueDate: { not: null },
            },
            orderBy: { dueDate: "asc" },
            take: 5,
            select: {
              displayId: true,
              actionItem: true,
              dueDate: true,
              owner: { select: { fullName: true } },
            },
          }),
        ]);

        console.log(`[Weekly Report] Entity: ${entity.name}`);
        console.log(`  Open: ${open}`);
        console.log(`  Overdue: ${overdue}`);
        console.log(`  Completed this week: ${completedThisWeek}`);
        console.log(`  Top overdue tickets:`);
        for (const t of topOverdue) {
          const dueStr = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "N/A";
          console.log(`    - ${t.displayId}: ${t.actionItem.substring(0, 60)} (due: ${dueStr}, owner: ${t.owner.fullName})`);
        }

        // Placeholder: in production, send this data via email using nodemailer
      }

      console.log("[Weekly Report] Complete.");
    } catch (err) {
      console.error("[Weekly Report] Error:", err);
    }
  });

  console.log("[Weekly Report] Scheduled for Sundays at 08:00");
}
