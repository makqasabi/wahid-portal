import prisma from "../config/prisma.js";
import type { NotificationType } from "@prisma/client";

/**
 * Create a single notification record.
 */
export async function createNotification(
  userId: string,
  ticketId: string,
  type: NotificationType,
  message: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, ticketId, type, message },
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

    const notifications: Array<{
      userId: string;
      ticketId: string;
      type: NotificationType;
      message: string;
    }> = [];

    for (const [userId, entityId] of participants) {
      if (userId === excludeUserId) continue;
      if (internalOnly && entityId !== internalOnly) continue;
      notifications.push({ userId, ticketId, type, message });
    }

    if (notifications.length > 0) {
      await prisma.notification.createMany({ data: notifications });
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
