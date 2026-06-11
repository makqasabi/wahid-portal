import prisma from "../config/prisma.js";
import type { NotificationType } from "@prisma/client";
import { sendNotificationEmail } from "./mail.service.js";
import { notifyWhatsApp } from "./whatsapp.service.js";
import { publish, type BroadcastNotification } from "./notification.bus.js";
import { getTemplate, renderTemplate } from "./settings.service.js";

async function emailSubject(type: NotificationType, displayId: string): Promise<string> {
  const tpl = await getTemplate(type);
  return renderTemplate(tpl.subject, { ticketId: displayId });
}

/**
 * Look up the user + ticket and send a notification email about a single ticket.
 * Returns true if the email was actually sent (or attempted).
 */
async function sendForNotification(
  userId: string,
  ticketId: string,
  type: NotificationType,
  message: string,
): Promise<boolean> {
  try {
    const [user, ticket] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true, phone: true, isActive: true },
      }),
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, displayId: true },
      }),
    ]);
    if (!user || !user.isActive || !ticket) return false;

    // The message itself is rendered from the admin-editable template by the
    // caller — it doubles as the email headline and WhatsApp text.
    const subject = await emailSubject(type, ticket.displayId);

    await Promise.all([
      sendNotificationEmail({
        toEmail: user.email,
        toName: user.fullName,
        subject,
        headline: message,
        body: "",
        ticketDisplayId: ticket.displayId,
        ticketId: ticket.id,
      }),
      // Fire WhatsApp alongside email — no-ops if disabled or no phone on file
      notifyWhatsApp(user.phone, message),
    ]);
    return true;
  } catch (err) {
    console.error("sendForNotification failed:", err);
    return false;
  }
}

/**
 * Create a single notification record (and fire an email if SMTP is configured).
 * Also publishes to the in-process bus so any SSE subscriber gets it instantly.
 */
export async function createNotification(
  userId: string,
  ticketId: string,
  type: NotificationType,
  message: string,
): Promise<void> {
  try {
    const sent = await sendForNotification(userId, ticketId, type, message);
    const created = await prisma.notification.create({
      data: { userId, ticketId, type, message, sentEmail: sent },
      include: { ticket: { select: { displayId: true } } },
    });
    publish(toBroadcast(created));
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

function toBroadcast(n: {
  id: string;
  userId: string;
  ticketId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  ticket: { displayId: string };
}): BroadcastNotification {
  return {
    id: n.id,
    userId: n.userId,
    ticketId: n.ticketId,
    ticketDisplayId: n.ticket.displayId,
    type: n.type,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Notify all participants of a ticket (owner, support, submitter).
 * Optionally filter to only same-entity participants when internalOnly is set.
 */
export async function notifyTicketParticipants(
  ticketId: string,
  excludeUserId: string,
  type: NotificationType,
  message: string,
  internalOnly?: string, // entityId to restrict to
): Promise<void> {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ownerId: true,
        supportId: true,
        submittedById: true,
        owner: { select: { entityId: true } },
        support: { select: { entityId: true } },
        submittedBy: { select: { entityId: true } },
      },
    });

    if (!ticket) return;

    const participants = new Map<string, string>(); // userId -> entityId
    participants.set(ticket.ownerId, ticket.owner.entityId);
    if (ticket.supportId && ticket.support) {
      participants.set(ticket.supportId, ticket.support.entityId);
    }
    participants.set(ticket.submittedById, ticket.submittedBy.entityId);

    const targets: string[] = [];
    for (const [userId, entityId] of participants) {
      if (userId === excludeUserId) continue;
      if (internalOnly && entityId !== internalOnly) continue;
      targets.push(userId);
    }

    if (targets.length === 0) return;

    // Send emails in parallel, write rows, then publish each to the bus
    const sendResults = await Promise.all(
      targets.map((uid) => sendForNotification(uid, ticketId, type, message)),
    );

    const ticketRow = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { displayId: true },
    });
    const displayId = ticketRow?.displayId ?? ticketId;

    // createMany doesn't return rows in Postgres-compatible Prisma, so create individually
    for (let i = 0; i < targets.length; i++) {
      const userId = targets[i]!;
      const created = await prisma.notification.create({
        data: { userId, ticketId, type, message, sentEmail: sendResults[i] ?? false },
        select: { id: true, userId: true, ticketId: true, type: true, message: true, isRead: true, createdAt: true },
      });
      publish({
        id: created.id,
        userId: created.userId,
        ticketId: created.ticketId,
        ticketDisplayId: displayId,
        type: created.type,
        message: created.message,
        isRead: created.isRead,
        createdAt: created.createdAt.toISOString(),
      });
    }
  } catch (err) {
    console.error("Failed to notify ticket participants:", err);
  }
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  notificationId: string,
  userId: string,
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return result.count > 0;
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return result.count;
}
