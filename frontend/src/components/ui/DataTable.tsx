import { type ReactNode, useState, useMemo } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  currentSort?: string;
  currentDirection?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-gray-200 dark:bg-gray-700" />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data found',
  onSort,
  currentSort: externalSort,
  currentDirection: externalDirection,
  onRowClick,
}: DataTableProps<T>) {
  // Internal sort state for when no external onSort is provided
  const [internalSort, setInternalSort] = useState<string | undefined>();
  const [internalDirection, setInternalDirection] = useState<'asc' | 'desc'>('asc');

  const currentSort = externalSort ?? internalSort;
  const currentDirection = externalDirection ?? internalDirection;

  const handleSort = (key: string) => {
    const newDirection =
      currentSort === key && currentDirection === 'asc' ? 'desc' : 'asc';

    if (onSort) {
      onSort(key, newDirection);
    } else {
      setInternalSort(key);
      setInternalDirection(newDirection);
    }
  };

  // Client-side sorting when no external handler
  const sortedData = useMemo(() => {
    if (onSort || !currentSort) return data;
    return [...data].sort((a, b) => {
      const aVal = a[currentSort];
      const bVal = b[currentSort];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number' && typeof bVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return currentDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, currentSort, currentDirection, onSort]);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400',
                  col.sortable && 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200',
                )}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="text-gray-400 dark:text-gray-500">
                      {currentSort === col.key ? (
                        currentDirection === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIndex) => (
              <tr
                key={(row.id as string) ?? rowIndex}
                className={cn(
                  'hover:bg-gray-50 transition-colors even:bg-gray-50/50 dark:hover:bg-gray-700 dark:even:bg-gray-800/50',
                  onRowClick && 'cursor-pointer',
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-start text-gray-700 dark:text-gray-300">
                    {col.render
                      ? col.render(row)
                      : (row[col.key] as ReactNode) ?? '-'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {loading && (
        <div className="flex justify-center py-4">
          <Spinner size="md" />
        </div>
      )}
    </div>
  );
}
