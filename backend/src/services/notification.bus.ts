import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for newly-created notifications. Used by the SSE
 * endpoint to push real-time updates to connected clients.
 *
 * One process only — if we ever scale to multiple backend replicas, swap
 * this for Redis pub/sub or similar.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0); // many concurrent subscribers expected

export interface BroadcastNotification {
  id: string;
  userId: string;
  ticketId: string;
  ticketDisplayId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const evt = (userId: string) => `user:${userId}`;

export function subscribe(
  userId: string,
  handler: (n: BroadcastNotification) => void,
): () => void {
  bus.on(evt(userId), handler);
  return () => bus.off(evt(userId), handler);
}

export function publish(notification: BroadcastNotification): void {
  bus.emit(evt(notification.userId), notification);
}
