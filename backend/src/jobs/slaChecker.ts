import cron, { type ScheduledTask } from "node-cron";
import prisma from "../config/prisma.js";
import { checkAndUpdateDelayed } from "../services/sla.service.js";
import { createNotification } from "../services/notification.service.js";
import {
  getSettings,
  getTemplate,
  renderTemplate,
} from "../services/settings.service.js";
import { openStatusKeys, defaultStatusKey } from "../services/workflow.service.js";

let task: ScheduledTask | null = null;
let currentCron = "";

/** The daily SLA pass — exported so the admin "run now" endpoint can call it. */
export async function runSlaCheck(): Promise<void> {
  console.log("[SLA Checker] Running daily check...");
  try {
    const settings = await getSettings();

    // 1. Auto-move overdue tickets to the workflow's overdue status
    const delayed = await checkAndUpdateDelayed();
    console.log(`[SLA Checker] Marked ${delayed} tickets as overdue`);

    const now = new Date();
    const openKeys = await openStatusKeys();
    const initialKey = await defaultStatusKey();

    // 2. SLA warning: tickets approaching their due date. Window comes from
    //    the owning entity's slaWarningDays (global default as fallback).
    const warnTpl = await getTemplate("SLA_WARNING");
    const entities = await prisma.entity.findMany({
      select: {
        id: true,
        name: true,
        slaWarningDays: true,
        slaEscalationDays: true,
        escalationContactId: true,
      },
    });
    let warningCount = 0;
    for (const entity of entities) {
      const days = entity.slaWarningDays ?? settings.sla.defaultWarningDays;
      const horizon = new Date(now.getTime() + days * 86_400_000);
      const warningTickets = await prisma.ticket.findMany({
        where: {
          ownerEntityId: entity.id,
          dueDate: { gte: now, lte: horizon },
          progress: { in: [initialKey] },
        },
        select: { id: true, displayId: true, ownerId: true, supportId: true },
      });
      for (const t of warningTickets) {
        const msg = renderTemplate(warnTpl.body, { ticketId: t.displayId, days });
        await createNotification(t.ownerId, t.id, "SLA_WARNING", msg);
        if (t.supportId) {
          await createNotification(t.supportId, t.id, "SLA_WARNING", msg);
        }
        warningCount++;
      }
    }
    console.log(`[SLA Checker] Sent ${warningCount} SLA warning notifications`);

    // 3. SLA overdue: tickets past their due date in any open status
    const overdueTpl = await getTemplate("SLA_OVERDUE");
    const overdueTickets = await prisma.ticket.findMany({
      where: {
        dueDate: { lt: now },
        progress: { in: openKeys },
      },
      select: { id: true, displayId: true, ownerId: true, supportId: true },
    });
    for (const t of overdueTickets) {
      await createNotification(
        t.ownerId,
        t.id,
        "SLA_OVERDUE",
        renderTemplate(overdueTpl.body, { ticketId: t.displayId }),
      );
    }
    console.log(`[SLA Checker] Sent ${overdueTickets.length} overdue notifications`);

    // 4. Escalation: tickets overdue beyond the entity's escalation threshold
    const escTpl = await getTemplate("ESCALATION");
    let escalationCount = 0;
    for (const entity of entities) {
      const escalationThreshold = new Date(
        now.getTime() - entity.slaEscalationDays * 86_400_000,
      );

      const escalationTickets = await prisma.ticket.findMany({
        where: {
          ownerEntityId: entity.id,
          dueDate: { lt: escalationThreshold },
          progress: { in: openKeys },
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
            renderTemplate(escTpl.body, {
              ticketId: t.displayId,
              days: entity.slaEscalationDays,
            }),
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
}

/**
 * Schedule (or re-schedule) the SLA checker using the admin-configured cron.
 * Called at boot and again whenever the SLA settings change.
 */
export async function scheduleSlaChecker(): Promise<void> {
  try {
    const settings = await getSettings();
    let expr = settings.sla.checkerCron;
    if (!cron.validate(expr)) {
      console.error(`[SLA Checker] Invalid cron '${expr}' — falling back to default`);
      expr = "5 0 * * *";
    }
    if (task && expr === currentCron) return; // unchanged
    if (task) task.stop();
    task = cron.schedule(expr, runSlaCheck);
    currentCron = expr;
    console.log(`[SLA Checker] Scheduled (cron: ${expr})`);
  } catch (err) {
    console.error("[SLA Checker] scheduling failed:", err);
  }
}
