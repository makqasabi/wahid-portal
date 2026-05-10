import cron from "node-cron";
import prisma from "../config/prisma.js";
import { checkAndUpdateDelayed } from "../services/sla.service.js";
import { createNotification } from "../services/notification.service.js";

/**
 * Schedule the daily SLA checker.
 * Runs at 00:05 every day.
 */
export function scheduleSlaChecker(): void {
  cron.schedule("5 0 * * *", async () => {
    console.log("[SLA Checker] Running daily check...");

    try {
      // 1. Auto-delay overdue tickets
      const delayed = await checkAndUpdateDelayed();
      console.log(`[SLA Checker] Marked ${delayed} tickets as DELAYED`);

      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 86_400_000);

      // 2. SLA Warning: tickets due within 3 days
      const warningTickets = await prisma.ticket.findMany({
        where: {
          dueDate: { gte: now, lte: threeDaysFromNow },
          progress: { in: ["IN_PROGRESS"] },
        },
        select: { id: true, displayId: true, ownerId: true, supportId: true },
      });

      for (const t of warningTickets) {
        await createNotification(
          t.ownerId,
          t.id,
          "SLA_WARNING",
          `Ticket ${t.displayId} is due within 3 days`,
        );
        if (t.supportId) {
          await createNotification(
            t.supportId,
            t.id,
            "SLA_WARNING",
            `Ticket ${t.displayId} is due within 3 days`,
          );
        }
      }
      console.log(`[SLA Checker] Sent ${warningTickets.length} SLA warning notifications`);

      // 3. SLA Overdue: tickets past due date
      const overdueTickets = await prisma.ticket.findMany({
        where: {
          dueDate: { lt: now },
          progress: { in: ["IN_PROGRESS", "DELAYED"] },
        },
        select: { id: true, displayId: true, ownerId: true, supportId: true },
      });

      for (const t of overdueTickets) {
        await createNotification(
          t.ownerId,
          t.id,
          "SLA_OVERDUE",
          `Ticket ${t.displayId} is overdue`,
        );
      }
      console.log(`[SLA Checker] Sent ${overdueTickets.length} overdue notifications`);

      // 4. Escalation: tickets overdue beyond entity's escalation threshold
      const entities = await prisma.entity.findMany({
        select: { id: true, name: true, slaEscalationDays: true, escalationContactId: true },
      });

      let escalationCount = 0;
      for (const entity of entities) {
        const escalationThreshold = new Date(
          now.getTime() - entity.slaEscalationDays * 86_400_000,
        );

        const escalationTickets = await prisma.ticket.findMany({
          where: {
            ownerEntityId: entity.id,
            dueDate: { lt: escalationThreshold },
            progress: { in: ["IN_PROGRESS", "DELAYED"] },
          },
          select: { id: true, displayId: true, ownerTeamId: true },
        });

        if (escalationTickets.length === 0) continue;

        // Find team leads for affected teams
        const teamIds = [...new Set(escalationTickets.map((t) => t.ownerTeamId))];
        const teamLeads = await prisma.user.findMany({
          where: {
            teamId: { in: teamIds },
            role: "TEAM_LEAD",
            isActive: true,
          },
          select: { id: true, teamId: true },
        });

        // Optional management contact for the entity
        const managementId = entity.escalationContactId;

        for (const t of escalationTickets) {
          const leads = teamLeads.filter((l) => l.teamId === t.ownerTeamId);
          const recipientIds = new Set<string>(leads.map((l) => l.id));
          if (managementId) recipientIds.add(managementId);

          for (const recipientId of recipientIds) {
            await createNotification(
              recipientId,
              t.id,
              "ESCALATION",
              `Ticket ${t.displayId} has been overdue for more than ${entity.slaEscalationDays} days`,
            );
            escalationCount++;
          }
        }
      }

      console.log(`[SLA Checker] Sent ${escalationCount} escalation notifications`);
      console.log("[SLA Checker] Daily check complete.");
    } catch (err) {
      console.error("[SLA Checker] Error:", err);
    }
  });

  console.log("[SLA Checker] Scheduled daily at 00:05");
}
