import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, MessageSquare, AlertTriangle, UserPlus, ArrowUpRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDateTime } from '@/lib/utils';
import type { NotificationType } from '@/types';

const typeIcons: Record<NotificationType, React.ReactNode> = {
  ASSIGNED: <UserPlus className="h-4 w-4 text-blue-500" />,
  STATUS_CHANGED: <ArrowUpRight className="h-4 w-4 text-green-500" />,
  SLA_WARNING: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  SLA_OVERDUE: <AlertTriangle className="h-4 w-4 text-red-500" />,
  COMMENT_ADDED: <MessageSquare className="h-4 w-4 text-purple-500" />,
  ESCALATION: <Clock className="h-4 w-4 text-orange-500" />,
};

export function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (id: string, ticketId?: string) => {
    await markRead(id);
    if (ticketId) {
      navigate(`/tickets/${ticketId}`);
    }
    setOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-xs text-twn-600 hover:text-twn-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('notifications.noNew')}
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id, n.ticketId)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-gray-50 dark:hover:bg-gray-700',
                    !n.isRead && 'bg-blue-50/40 dark:bg-blue-900/20',
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    {typeIcons[n.type] ?? <Bell className="h-4 w-4 text-gray-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 line-clamp-2 dark:text-gray-300">{n.message}</p>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
