import cron, { type ScheduledTask } from "node-cron";
import prisma from "../config/prisma.js";
import { getSettings } from "../services/settings.service.js";
import {
  openStatusKeys,
  overdueStatusKey,
  closedStatusKeys,
} from "../services/workflow.service.js";
import { sendEmail } from "../services/mail.service.js";

let task: ScheduledTask | null = null;
let currentCron = "";

/** Generate the weekly report and email it to the configured recipients. */
export async function runWeeklyReport(): Promise<void> {
  console.log("[Weekly Report] Generating...");
  try {
    const settings = await getSettings();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [openKeys, overdueKey, closedKeys] = await Promise.all([
      openStatusKeys(),
      overdueStatusKey(),
      closedStatusKeys(),
    ]);

    const entities = await prisma.entity.findMany({
      select: { id: true, name: true, nameEn: true },
    });

    const sections: string[] = [];
    for (const entity of entities) {
      const scope = { ownerEntityId: entity.id };

      const [open, overdue, completedThisWeek, topOverdue] = await Promise.all([
        prisma.ticket.count({
          where: { ...scope, progress: { in: openKeys } },
        }),
        overdueKey
          ? prisma.ticket.count({ where: { ...scope, progress: overdueKey } })
          : Promise.resolve(0),
        prisma.ticket.count({
          where: {
            ...scope,
            progress: { in: closedKeys },
            closureDate: { gte: weekAgo },
          },
        }),
        prisma.ticket.findMany({
          where: {
            ...scope,
            ...(overdueKey ? { progress: overdueKey } : { progress: { in: [] } }),
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

      const lines = [
        `${entity.nameEn || entity.name}`,
        `  Open: ${open} | Overdue: ${overdue} | Completed this week: ${completedThisWeek}`,
      ];
      if (topOverdue.length) {
        lines.push("  Top overdue:");
        for (const t of topOverdue) {
          const dueStr = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "N/A";
          lines.push(
            `    - ${t.displayId}: ${t.actionItem.substring(0, 60)} (due ${dueStr}, ${t.owner.fullName})`,
          );
        }
      }
      sections.push(lines.join("\n"));
      console.log(`[Weekly Report] ${entity.name}: open=${open} overdue=${overdue} completed=${completedThisWeek}`);
    }

    const recipients = settings.reports.weeklyRecipients.filter((r) => r.includes("@"));
    if (recipients.length > 0) {
      const body = [
        `${settings.branding.fullNameEn} — weekly operations report`,
        `Week ending ${now.toISOString().slice(0, 10)}`,
        "",
        sections.join("\n\n"),
        "",
        settings.branding.emailSignature,
      ].join("\n");
      await sendEmail({
        to: recipients,
        subject: `${settings.branding.portalNameEn} weekly report — ${now.toISOString().slice(0, 10)}`,
        text: body,
      });
      console.log(`[Weekly Report] Emailed to ${recipients.length} recipient(s)`);
    } else {
      console.log("[Weekly Report] No recipients configured — report logged only");
    }

    console.log("[Weekly Report] Complete.");
  } catch (err) {
    console.error("[Weekly Report] Error:", err);
  }
}

/**
 * Schedule (or re-schedule) the weekly report using the admin-configured cron.
 * Called at boot and again whenever the report settings change.
 */
export async function scheduleWeeklyReport(): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.reports.weeklyEnabled) {
      if (task) {
        task.stop();
        task = null;
        currentCron = "";
      }
      console.log("[Weekly Report] Disabled in settings");
      return;
    }
    let expr = settings.reports.weeklyCron;
    if (!cron.validate(expr)) {
      console.error(`[Weekly Report] Invalid cron '${expr}' — falling back to default`);
      expr = "0 8 * * 0";
    }
    if (task && expr === currentCron) return; // unchanged
    if (task) task.stop();
    task = cron.schedule(expr, runWeeklyReport);
    currentCron = expr;
    console.log(`[Weekly Report] Scheduled (cron: ${expr})`);
  } catch (err) {
    console.error("[Weekly Report] scheduling failed:", err);
  }
}
