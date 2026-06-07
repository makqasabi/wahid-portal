import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn, localName } from '@/lib/utils';
import { useFilterStore } from '@/stores/filterStore';
import { referenceApi } from '@/api/client';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { Progress, Priority, Client, Category, User, Entity } from '@/types';

const PROGRESS_KEYS: { value: Progress; key: string }[] = [
  { value: 'IN_PROGRESS', key: 'inProgress' },
  { value: 'DELAYED', key: 'delayed' },
  { value: 'COMPLETED', key: 'completed' },
  { value: 'ON_HOLD', key: 'onHold' },
  { value: 'DEPENDENT', key: 'dependent' },
];

const PRIORITY_KEYS: { value: Priority; key: string }[] = [
  { value: 'CRITICAL', key: 'critical' },
  { value: 'HIGH', key: 'high' },
  { value: 'MEDIUM', key: 'medium' },
  { value: 'LOW', key: 'low' },
];

export function TicketFilters() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useFilterStore();
  const [expanded, setExpanded] = useState(false);

  const [clients, setClients] = useState<SelectOption[]>([]);
  const [categories, setCategories] = useState<SelectOption[]>([]);
  const [users, setUsers] = useState<SelectOption[]>([]);
  const [entityTabs, setEntityTabs] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('all') },
  ]);

  // Fetch dropdown options on mount
  useEffect(() => {
    referenceApi.getClients().then((data: Client[]) =>
      setClients(data.map((c) => ({ value: c.id, label: localName(c, i18n.language) }))),
    ).catch(() => {});

    referenceApi.getCategories().then((data: Category[]) =>
      setCategories(data.map((c) => ({ value: c.id, label: localName(c, i18n.language) }))),
    ).catch(() => {});

    referenceApi.getUsers().then((data: User[]) =>
      setUsers(data.map((u) => ({ value: u.id, label: u.fullName }))),
    ).catch(() => {});

    referenceApi.getEntities().then((data: Entity[]) =>
      setEntityTabs([
        { value: '', label: t('all') },
        ...data.map((e) => ({ value: e.id, label: localName(e, i18n.language) })),
      ]),
    ).catch(() => {});
  }, []);

  // Sync URL params to store on mount
  useEffect(() => {
    const entity = searchParams.get('entityId') ?? '';
    const progress = searchParams.get('progress')?.split(',').filter(Boolean) ?? [];
    const priority = searchParams.get('priority')?.split(',').filter(Boolean) ?? [];
    const search = searchParams.get('search') ?? '';
    const clientId = searchParams.get('clientId') ?? '';
    const categoryId = searchParams.get('categoryId') ?? '';
    const ownerId = searchParams.get('ownerId') ?? '';
    const dueDateFrom = searchParams.get('dueDateFrom') ?? '';
    const dueDateTo = searchParams.get('dueDateTo') ?? '';

    if (entity) filters.setFilter('entityId', entity);
    if (progress.length) filters.setFilter('progress', progress);
    if (priority.length) filters.setFilter('priority', priority);
    if (search) filters.setFilter('search', search);
    if (clientId) filters.setFilter('clientId', clientId);
    if (categoryId) filters.setFilter('categoryId', categoryId);
    if (ownerId) filters.setFilter('ownerId', ownerId);
    if (dueDateFrom) filters.setFilter('dueDateFrom', dueDateFrom);
    if (dueDateTo) filters.setFilter('dueDateTo', dueDateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync store changes to URL
  const syncToUrl = () => {
    const params = new URLSearchParams();
    if (filters.entityId) params.set('entityId', filters.entityId);
    if (filters.progress.length) params.set('progress', filters.progress.join(','));
    if (filters.priority.length) params.set('priority', filters.priority.join(','));
    if (filters.search) params.set('search', filters.search);
    if (filters.clientId) params.set('clientId', filters.clientId);
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.ownerId) params.set('ownerId', filters.ownerId);
    if (filters.dueDateFrom) params.set('dueDateFrom', filters.dueDateFrom);
    if (filters.dueDateTo) params.set('dueDateTo', filters.dueDateTo);
    setSearchParams(params, { replace: true });
  };

  const handleFilterChange = (key: string, value: unknown) => {
    filters.setFilter(key, value);
    // Defer URL sync
    setTimeout(syncToUrl, 0);
  };

  const toggleArrayFilter = (key: 'progress' | 'priority', value: string) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    handleFilterChange(key, next);
  };

  const handleClear = () => {
    filters.clearFilters();
    setSearchParams({}, { replace: true });
  };

  const hasActiveFilters =
    filters.entityId ||
    filters.progress.length > 0 ||
    filters.priority.length > 0 ||
    filters.clientId ||
    filters.categoryId ||
    filters.ownerId ||
    filters.dueDateFrom ||
    filters.dueDateTo ||
    filters.search;

  return (
    <div className="space-y-3">
      {/* Top row: search + entity toggle + expand */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input
            placeholder={t('filters.search') ?? 'Search tickets...'}
            icon={<Search className="h-4 w-4" />}
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>

        {/* Entity toggle */}
        <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
          {entityTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleFilterChange('entityId', tab.value)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filters.entityId === tab.value
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t('filters.more') ?? 'Filters'}
        </button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear} icon={<X className="h-3.5 w-3.5" />}>
            {t('filters.clear') ?? 'Clear all'}
          </Button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status checkboxes */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                {t('filters.status') ?? 'Status'}
              </p>
              <div className="flex flex-wrap gap-2">
                {PROGRESS_KEYS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      filters.progress.includes(opt.value)
                        ? 'border-twn-300 bg-twn-50 text-twn-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={filters.progress.includes(opt.value)}
                      onChange={() => toggleArrayFilter('progress', opt.value)}
                    />
                    {t(opt.key)}
                  </label>
                ))}
              </div>
            </div>

            {/* Priority checkboxes */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                {t('filters.priority') ?? 'Priority'}
              </p>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_KEYS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      filters.priority.includes(opt.value)
                        ? 'border-twn-300 bg-twn-50 text-twn-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={filters.priority.includes(opt.value)}
                      onChange={() => toggleArrayFilter('priority', opt.value)}
                    />
                    {t(opt.key)}
                  </label>
                ))}
              </div>
            </div>

            {/* Client dropdown */}
            <Select
              label={t('filters.client')}
              options={[{ value: '', label: t('filters.allClients') }, ...clients]}
              value={filters.clientId}
              onChange={(e) => handleFilterChange('clientId', e.target.value)}
            />

            {/* Category dropdown */}
            <Select
              label={t('filters.category')}
              options={[{ value: '', label: t('filters.allCategories') }, ...categories]}
              value={filters.categoryId}
              onChange={(e) => handleFilterChange('categoryId', e.target.value)}
            />

            {/* Owner select */}
            <Select
              label={t('filters.owner')}
              options={[{ value: '', label: t('filters.allOwners') }, ...users]}
              value={filters.ownerId}
              onChange={(e) => handleFilterChange('ownerId', e.target.value)}
            />

            {/* Submitted By select */}
            <Select
              label={t('submittedBy')}
              options={[{ value: '', label: t('filters.allSubmitters') }, ...users]}
              value={filters.submittedById}
              onChange={(e) => handleFilterChange('submittedById', e.target.value)}
            />

            {/* Date range */}
            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('filters.dateRange')}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  placeholder={t('filters.from')}
                  value={filters.dueDateFrom}
                  onChange={(e) => handleFilterChange('dueDateFrom', e.target.value)}
                />
                <span className="text-gray-400 shrink-0 dark:text-gray-500">{t('filters.to')}</span>
                <Input
                  type="date"
                  placeholder={t('filters.to')}
                  value={filters.dueDateTo}
                  onChange={(e) => handleFilterChange('dueDateTo', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
