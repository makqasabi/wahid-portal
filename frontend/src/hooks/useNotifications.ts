import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import type { Notification } from '@/types';

const POLL_INTERVAL = 60_000; // fallback poll, in case the SSE drops

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await notificationsApi.getUnread();
      setNotifications(data);
      setUnreadCount(data.length);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [isAuthenticated]);

  // Initial fetch + fallback polling
  useEffect(() => {
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  // Real-time SSE stream
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('notification', (ev) => {
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as Notification & { ticketDisplayId: string };
        setNotifications((prev) => {
          if (prev.some((n) => n.id === incoming.id)) return prev;
          // Frontend Notification type expects ticket: { id, displayId }
          const enriched = {
            ...incoming,
            ticket: { id: incoming.ticketId, displayId: incoming.ticketDisplayId },
          } as unknown as Notification;
          return [enriched, ...prev];
        });
        setUnreadCount((c) => c + 1);
      } catch {
        // ignore malformed payloads
      }
    });

    es.onerror = () => {
      // Browser auto-reconnects on transient errors. If the stream is closed
      // permanently (e.g., token expired), the polling fallback covers us.
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isAuthenticated, token]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    fetchNotifications,
    markRead,
    markAllRead,
  };
}
