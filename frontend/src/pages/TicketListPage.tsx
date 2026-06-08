import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Download, User, Users, AlertTriangle, List } from 'lucide-react';
import { useTickets } from '@/hooks/useTickets';
import { useAuth } from '@/hooks/useAuth';
import { useFilterStore } from '@/stores/filterStore';
import { exportApi } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/tickets/StatusBadge';
import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaBadge } from '@/components/tickets/SlaBadge';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { Badge } from '@/components/ui/Badge';
import { cn, formatDate, truncate, isMeenaEntity, localName } from '@/lib/utils';
import type { Ticket, Progress } from '@/types';
import toast from 'react-hot-toast';

type QuickFilter = 'all' | 'mine' | 'team' | 'overdue';

export default function TicketListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tickets, loading, pagination } = useTickets();
  const filters = useFilterStore();

  const activeQuickFilter = (): QuickFilter => {
    if (
      filters.ownerId === user?.id &&
      filters.submittedById === user?.id &&
      filters.progress.length === 0
    )
      return 'mine';
    if (filters.teamId === user?.teamId && filters.progress.length === 0) return 'team';
    if (
      filters.progress.length === 1 &&
      filters.progress[0] === 'DELAYED' &&
      !filters.ownerId &&
      !filters.teamId
    )
      return 'overdue';
    if (
      !filters.ownerId &&
      !filters.teamId &&
      !filters.submittedById &&
      filters.progress.length === 0
    )
      return 'all';
    return 'all';
  };

  const setQuickFilter = (tab: QuickFilter) => {
    filters.clearFilters();
    switch (tab) {
      case 'mine':
        // Both set — backend uses OR logic when both match the same user
        if (user) {
          filters.setFilter('ownerId', user.id);
          filters.setFilter('submittedById', user.id);
        }
        break;
      case 'team':
        if (user) filters.setFilter('teamId', user.teamId);
        break;
      case 'overdue':
        filters.setFilter('progress', ['DELAYED']);
        break;
      case 'all':
      default:
        break;
    }
  };

  const handleSort = (key: string, direction: 'asc' | 'desc') => {
    filters.setFilter('sortBy', key);
    filters.setFilter('sortOrder', direction);
  };

  const handleExport = async () => {
    try {
      const blob = await exportApi.ticketsExcel(filters.toQueryString());
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tickets.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(t('exportDownloaded'));
    } catch {
      toast.error(t('failedExportTickets'));
    }
  };

  const isOverdue = useCallback(
    (dueDate?: string, progress?: Progress) => {
      if (!dueDate || progress === 'COMPLETED') return false;
      return new Date(dueDate) < new Date();
    },
    [],
  );

  const columns: Column<Ticket>[] = [
    {
      key: 'displayId',
      header: t('id'),
      sortable: true,
      render: (row: Ticket) => (
        <button
          onClick={() => navigate(`/tickets/${row.id}`)}
          className="font-medium text-twn-600 hover:underline"
        >
          {row.displayId}
        </button>
      ),
    },
    {
      key: 'actionItem',
      header: t('actionItem'),
      render: (row: Ticket) => (
        <span className="text-gray-900 dark:text-gray-100" title={row.actionItem}>
          {truncate(row.actionItem, 60)}
        </span>
      ),
    },
    {
      key: 'client',
      header: t('client'),
      render: (row: Ticket) => localName(row.client, i18n.language),
    },
    {
      key: 'owner',
      header: t('owner'),
      render: (row: Ticket) => row.owner?.fullName ?? '-',
    },
    {
      key: 'dueDate',
      header: t('dueDate'),
      sortable: true,
      render: (row: Ticket) =>
        row.dueDate ? (
          <span
            className={cn(
              isOverdue(row.dueDate, row.progress) && 'font-semibold text-red-600',
            )}
          >
            {formatDate(row.dueDate)}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'sla',
      header: t('sla'),
      render: (row: Ticket) => (
        <SlaBadge
          slaVarianceDays={row.slaVarianceDays}
          dueDate={row.dueDate}
          progress={row.progress}
        />
      ),
    },
    {
      key: 'progress',
      header: t('status'),
      sortable: true,
      render: (row: Ticket) => <StatusBadge status={row.progress} />,
    },
    {
      key: 'priority',
      header: t('priority'),
      sortable: true,
      render: (row: Ticket) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'ownerEntity',
      header: t('entity'),
      render: (row: Ticket) => {
        const name = row.ownerEntity?.name ?? '';
        return name ? <Badge variant={isMeenaEntity(name) ? 'warning' : 'info'}>{localName(row.ownerEntity, i18n.language)}</Badge> : <span>-</span>;
      },
    },
  ];

  const quickTabs: { key: QuickFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'mine', label: t('myTickets'), icon: <User className="h-4 w-4" /> },
    { key: 'team', label: t('myTeam'), icon: <Users className="h-4 w-4" /> },
    { key: 'overdue', label: t('overdue'), icon: <AlertTriangle className="h-4 w-4" /> },
    { key: 'all', label: t('all'), icon: <List className="h-4 w-4" /> },
  ];

  const current = activeQuickFilter();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('tickets.title') ?? 'Tickets'}
        </h1>
        <div data-tour="ticket-actions" className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            {t('export')}
          </Button>
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/tickets/create')}
          >
            {t('createTicket')}
          </Button>
        </div>
      </div>

      {/* Quick filter tabs */}
      <div data-tour="ticket-quick-filters" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
        {quickTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setQuickFilter(tab.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              current === tab.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <TicketFilters />

      {/* Data Table */}
      <div className="surface overflow-hidden">
        <DataTable
          columns={columns}
          data={tickets as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyMessage={t('noTicketsFound')}
          onSort={handleSort}
          currentSort={filters.sortBy}
          currentDirection={filters.sortOrder}
          onRowClick={(row) => navigate(`/tickets/${(row as unknown as Ticket).id}`)}
          mobileCard={(row) => {
            const tk = row as unknown as Ticket;
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-twn-600">{tk.displayId}</span>
                  <StatusBadge status={tk.progress} />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {truncate(tk.actionItem, 90)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={tk.priority} />
                  {tk.ownerEntity?.name && (
                    <Badge variant={isMeenaEntity(tk.ownerEntity.name) ? 'warning' : 'info'}>
                      {localName(tk.ownerEntity, i18n.language)}
                    </Badge>
                  )}
                  <SlaBadge
                    slaVarianceDays={tk.slaVarianceDays}
                    dueDate={tk.dueDate}
                    progress={tk.progress}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate">{localName(tk.client, i18n.language)}</span>
                  <span className="truncate">{tk.owner?.fullName ?? '-'}</span>
                  <span
                    className={cn(
                      isOverdue(tk.dueDate, tk.progress) && 'font-semibold text-red-600',
                    )}
                  >
                    {tk.dueDate ? formatDate(tk.dueDate) : '-'}
                  </span>
                </div>
              </div>
            );
          }}
        />
      </div>

      {/* Pagination */}
      {pagination.totalPages > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={(p) => filters.setPage(p)}
          onLimitChange={(l) => filters.setFilter('limit', l)}
        />
      )}
    </div>
  );
}
