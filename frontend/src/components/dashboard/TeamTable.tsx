import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { cn } from '@/lib/utils';

interface TeamRow {
  teamName: string;
  open: number;
  overdue: number;
  completed: number;
  avgSla: number;
  onTimeRate: number;
  [key: string]: unknown;
}

interface TeamTableProps {
  data: TeamRow[];
}

function slaColor(days: number): string {
  if (days <= 0) return 'text-green-700';
  if (days <= 3) return 'text-yellow-700';
  return 'text-red-700';
}

function rateColor(rate: number): string {
  if (rate >= 90) return 'text-green-700';
  if (rate >= 70) return 'text-yellow-700';
  return 'text-red-700';
}

const columns: Column<TeamRow>[] = [
  {
    key: 'teamName',
    header: 'Team',
    sortable: true,
  },
  {
    key: 'open',
    header: 'Open',
    sortable: true,
  },
  {
    key: 'overdue',
    header: 'Overdue',
    sortable: true,
    render: (row) => (
      <span className={cn(row.overdue > 0 && 'font-semibold text-red-600')}>
        {row.overdue}
      </span>
    ),
  },
  {
    key: 'completed',
    header: 'Completed',
    sortable: true,
  },
  {
    key: 'avgSla',
    header: 'Avg SLA',
    sortable: true,
    render: (row) => (
      <span className={cn('font-medium', slaColor(row.avgSla))}>
        {row.avgSla > 0 ? '+' : ''}
        {row.avgSla} days
      </span>
    ),
  },
  {
    key: 'onTimeRate',
    header: 'On-Time %',
    sortable: true,
    render: (row) => (
      <span className={cn('font-medium', rateColor(row.onTimeRate))}>
        {row.onTimeRate}%
      </span>
    ),
  },
];

export function TeamTable({ data }: TeamTableProps) {
  const [sortKey, setSortKey] = useState<string>('teamName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <DataTable
      columns={columns}
      data={sorted}
      currentSort={sortKey}
      currentDirection={sortDir}
      onSort={(key, dir) => {
        setSortKey(key);
        setSortDir(dir);
      }}
      emptyMessage="No team data available"
    />
  );
}
