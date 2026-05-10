import prisma from "../config/prisma.js";
import type { NotificationType } from "@prisma/client";
import { sendNotificationEmail } from "./mail.service.js";

function emailSubject(type: NotificationType, displayId: string): string {
  switch (type) {
    case "TICKET_ASSIGNED": return `You were assigned to ticket ${displayId}`;
    case "TICKET_UPDATED":  return `Ticket ${displayId} was updated`;
    case "COMMENT_ADDED":   return `New comment on ticket ${displayId}`;
    case "STATUS_CHANGED":  return `Ticket ${displayId} status changed`;
    case "SLA_WARNING":     return `Ticket ${displayId} is due soon`;
    case "SLA_OVERDUE":     return `Ticket ${displayId} is overdue`;
    case "ESCALATION":      return `Escalation: ticket ${displayId}`;
    case "ATTACHMENT_ADDED": return `Attachment added to ticket ${displayId}`;
    default: return `Update on ticket ${displayId}`;
  }
}

function emailHeadline(type: NotificationType, displayId: string): string {
  switch (type) {
    case "TICKET_ASSIGNED": return `You're now the owner of ticket ${displayId}`;
    case "COMMENT_ADDED":   return `Someone commented on ticket ${displayId}`;
    case "STATUS_CHANGED":  return `Status changed on ticket ${displayId}`;
    case "SLA_WARNING":     return `Ticket ${displayId} is approaching its due date`;
    case "SLA_OVERDUE":     return `Ticket ${displayId} has missed its due date`;
    case "ESCALATION":      return `Escalation — ticket ${displayId}`;
    default: return `Update on ticket ${displayId}`;
  }
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
        select: { email: true, fullName: true, isActive: true },
      }),
      prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, displayId: true },
      }),
    ]);
    if (!user || !user.isActive || !ticket) return false;

    await sendNotificationEmail({
      toEmail: user.email,
      toName: user.fullName,
      subject: emailSubject(type, ticket.displayId),
      headline: emailHeadline(type, ticket.displayId),
      body: message,
      ticketDisplayId: ticket.displayId,
      ticketId: ticket.id,
    });
    return true;
  } catch (err) {
    console.error("sendForNotification failed:", err);
    return false;
  }
}

/**
 * Create a single notification record (and fire an email if SMTP is configured).
 */
export async function createNotification(
  userId: string,
  ticketId: string,
  type: NotificationType,
  message: string,
): Promise<void> {
  try {
    const sent = await sendForNotification(userId, ticketId, type, message);
    await prisma.notification.create({
      data: { userId, ticketId, type, message, sentEmail: sent },
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
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

    // Send emails in parallel, then write notification rows
    const sendResults = await Promise.all(
      targets.map((uid) => sendForNotification(uid, ticketId, type, message)),
    );

    await prisma.notification.createMany({
      data: targets.map((userId, i) => ({
        userId,
        ticketId,
        type,
        message,
        sentEmail: sendResults[i] ?? false,
      })),
    });
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
