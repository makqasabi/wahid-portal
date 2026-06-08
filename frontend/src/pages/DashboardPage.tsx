import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Gauge,
  PauseCircle,
  TrendingUp,
  RefreshCw,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  BarChart3,
} from 'lucide-react';
import { dashboardApi, referenceApi, type KpiTrends, type TrendMetric } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { cn, localName } from '@/lib/utils';
import type { DashboardStats, Entity } from '@/types';

interface EntitySplitEntry {
  status: string;
  التعاونية: number;
  مينا: number;
}

interface SlaTrendEntry {
  month: string;
  التعاونية: number;
  مينا: number;
}

interface CategoryEntry {
  category: string;
  IN_PROGRESS: number;
  DELAYED: number;
  COMPLETED: number;
  ON_HOLD: number;
  DEPENDENT: number;
}

interface AgingEntry {
  bucket: string;
  count: number;
}

interface TeamEntry {
  team: string;
  open: number;
  overdue: number;
  completed: number;
  avgSla: number;
  onTimeRate: number;
  [key: string]: unknown;
}

// Brand + status palette (kept in one place so charts stay consistent)
const COLORS = {
  twn: '#21688c',
  meena: '#059669',
  inProgress: '#0ea5e9',
  delayed: '#f43f5e',
  completed: '#10b981',
  onHold: '#94a3b8',
  dependent: '#f97316',
  indigo: '#6366f1',
};

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgb(226 232 240)',
  boxShadow: '0 12px 32px -8px rgb(16 24 40 / 0.18)',
  fontSize: 12,
  padding: '8px 12px',
};

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-600">
      <BarChart3 className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// Lightweight inline SVG sparkline (no recharts overhead for tiny charts)
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 72;
  const h = 26;
  const pad = 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return { x, y };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2} fill={color} />
    </svg>
  );
}

// Prev-period delta chip. goodIfUp=false means lower-is-better (e.g. SLA variance).
function Delta({ metric, goodIfUp }: { metric: TrendMetric; goodIfUp: boolean }) {
  const { current, previous } = metric;
  if (current === previous) return null;
  const diff = current - previous;
  const pct = previous !== 0 ? Math.round((Math.abs(diff) / Math.abs(previous)) * 100) : 100;
  const up = diff > 0;
  const good = up === goodIfUp;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
        good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      )}
      title={`${current} vs ${previous} (previous 30 days)`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {pct}%
    </span>
  );
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isSuperAdmin, user } = useAuth();
  const [selectedEntity, setSelectedEntity] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );
  const [entities, setEntities] = useState<Entity[]>([]);
  const entityTabs = [
    { value: '', label: t('all') },
    ...entities.map((e) => ({ value: e.id, label: localName(e, i18n.language) })),
  ];

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trends, setTrends] = useState<KpiTrends | null>(null);
  const [entitySplit, setEntitySplit] = useState<EntitySplitEntry[]>([]);
  const [slaTrend, setSlaTrend] = useState<SlaTrendEntry[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryEntry[]>([]);
  const [aging, setAging] = useState<AgingEntry[]>([]);
  const [teamData, setTeamData] = useState<TeamEntry[]>([]);

  useEffect(() => {
    referenceApi.getEntities().then(setEntities).catch(() => {});
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const eid = selectedEntity || undefined;
      try {
        const [s, es, st, cb, ag, ta, tr] = await Promise.all([
          dashboardApi.getStats(eid),
          dashboardApi.getEntitySplit(eid),
          dashboardApi.getSlaTrend(eid),
          dashboardApi.getCategoryBreakdown(eid),
          dashboardApi.getAging(eid),
          dashboardApi.getTeamAccountability(eid),
          dashboardApi.getKpiTrends(eid),
        ]);
        setStats(s as DashboardStats);
        setTrends(tr as KpiTrends | null);

        const statusLabel: Record<string, string> = {
          IN_PROGRESS: t('inProgress'),
          DELAYED: t('delayed'),
          COMPLETED: t('completed'),
          ON_HOLD: t('onHold'),
          DEPENDENT: t('dependent'),
        };

        const esRaw = es as { entityName: string; status: string; count: number }[];
        const esMap = new Map<string, EntitySplitEntry>();
        for (const row of esRaw) {
          const label = statusLabel[row.status] ?? row.status;
          if (!esMap.has(label)) esMap.set(label, { status: label, التعاونية: 0, مينا: 0 });
          const entry = esMap.get(label)!;
          if (row.entityName === 'التعاونية') entry.التعاونية = row.count;
          else entry.مينا = row.count;
        }
        setEntitySplit([...esMap.values()]);

        const stRaw = st as { month: string; entityName: string; onTimeRate: number }[];
        const stMap = new Map<string, SlaTrendEntry>();
        for (const row of stRaw) {
          if (!stMap.has(row.month)) stMap.set(row.month, { month: row.month, التعاونية: 0, مينا: 0 });
          const entry = stMap.get(row.month)!;
          if (row.entityName === 'التعاونية') entry.التعاونية = row.onTimeRate;
          else entry.مينا = row.onTimeRate;
        }
        setSlaTrend([...stMap.values()]);

        const isEn = i18n.language !== 'ar';
        const cbRaw = cb as {
          categoryName: string;
          categoryNameEn?: string | null;
          status: string;
          count: number;
        }[];
        const cbMap = new Map<string, CategoryEntry>();
        for (const row of cbRaw) {
          const catLabel = isEn && row.categoryNameEn ? row.categoryNameEn : row.categoryName;
          if (!cbMap.has(catLabel)) {
            cbMap.set(catLabel, {
              category: catLabel,
              IN_PROGRESS: 0,
              DELAYED: 0,
              COMPLETED: 0,
              ON_HOLD: 0,
              DEPENDENT: 0,
            });
          }
          const entry = cbMap.get(catLabel)!;
          (entry as Record<string, unknown>)[row.status] = row.count;
        }
        setCategoryBreakdown([...cbMap.values()]);

        const agRaw = ag as AgingEntry[];
        const bucketLabel: Record<string, string> = {
          '0-7': `0-7 ${t('days')}`,
          '8-14': `8-14 ${t('days')}`,
          '15-30': `15-30 ${t('days')}`,
          '30+': `+30 ${t('days')}`,
        };
        setAging(agRaw.map((a) => ({ ...a, bucket: bucketLabel[a.bucket] ?? a.bucket })));

        const taRaw = ta as {
          teamName: string;
          teamNameEn?: string | null;
          entityName: string;
          entityNameEn?: string | null;
          open: number;
          overdue: number;
          completed: number;
          avgSlaVariance: number | null;
          onTimeRate: number | null;
        }[];
        setTeamData(
          taRaw.map((r) => {
            const eName = isEn && r.entityNameEn ? r.entityNameEn : r.entityName;
            const tName = isEn && r.teamNameEn ? r.teamNameEn : r.teamName;
            return {
              team: `${eName} — ${tName}`,
              open: r.open,
              overdue: r.overdue,
              completed: r.completed,
              avgSla: r.avgSlaVariance ?? 0,
              onTimeRate: r.onTimeRate ?? 0,
            };
          }),
        );
        setLastUpdated(new Date());
      } catch {
        // non-critical — sections show their empty state
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedEntity, i18n.language, t],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 2 minutes (silent)
  useEffect(() => {
    const id = setInterval(() => load(true), 120_000);
    return () => clearInterval(id);
  }, [load]);

  // Drill-down target for a KPI → filtered ticket list
  const drill = (progress?: string) => {
    const params = new URLSearchParams();
    if (progress) params.set('progress', progress);
    if (selectedEntity) params.set('entityId', selectedEntity);
    const qs = params.toString();
    navigate(`/tickets${qs ? `?${qs}` : ''}`);
  };

  const kpis: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    onClick?: () => void;
    trend?: TrendMetric;
    goodIfUp?: boolean;
    spark?: string;
  }[] = stats
    ? [
        {
          label: t('totalOpen'),
          value: stats.totalOpen.toLocaleString(),
          icon: <Clock className="h-6 w-6" />,
          color: 'text-sky-600 bg-sky-50 dark:bg-sky-500/10',
          onClick: () => drill(),
        },
        {
          label: t('overdue'),
          value: stats.overdue.toLocaleString(),
          icon: <AlertTriangle className="h-6 w-6" />,
          color: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10',
          onClick: () => drill('DELAYED'),
        },
        {
          label: t('completedThisMonth'),
          value: stats.completedThisMonth.toLocaleString(),
          icon: <CheckCircle className="h-6 w-6" />,
          color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10',
          onClick: () => drill('COMPLETED'),
          trend: trends?.completed,
          goodIfUp: true,
          spark: '#10b981',
        },
        {
          label: t('avgSlaVariance'),
          value: `${stats.avgSlaVariance >= 0 ? '+' : ''}${stats.avgSlaVariance.toFixed(1)}d`,
          icon: <Gauge className="h-6 w-6" />,
          color: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10',
          trend: trends?.avgSlaVariance,
          goodIfUp: false,
          spark: '#8b5cf6',
        },
        {
          label: t('onTimeRate'),
          value: `${stats.onTimeRate.toFixed(0)}%`,
          icon: <TrendingUp className="h-6 w-6" />,
          color: 'text-teal-600 bg-teal-50 dark:bg-teal-500/10',
          trend: trends?.onTimeRate,
          goodIfUp: true,
          spark: '#14b8a6',
        },
        {
          label: t('onHoldDependent'),
          value: stats.onHoldDependent.toLocaleString(),
          icon: <PauseCircle className="h-6 w-6" />,
          color: 'text-gray-600 bg-gray-100 dark:bg-gray-500/10',
          onClick: () => drill('ON_HOLD,DEPENDENT'),
        },
      ]
    : [];

  const teamColumns: Column<TeamEntry>[] = [
    { key: 'team', header: t('team'), sortable: true },
    { key: 'open', header: t('open'), sortable: true },
    {
      key: 'overdue',
      header: t('overdue'),
      sortable: true,
      render: (row: TeamEntry) => (
        <span className={row.overdue > 0 ? 'font-semibold text-rose-600' : ''}>{row.overdue}</span>
      ),
    },
    { key: 'completed', header: t('completed'), sortable: true },
    {
      key: 'avgSla',
      header: t('avgSlaDays'),
      sortable: true,
      render: (row: TeamEntry) => row.avgSla.toFixed(1),
    },
    {
      key: 'onTimeRate',
      header: t('onTimePercent'),
      sortable: true,
      render: (row: TeamEntry) => (
        <span
          className={cn(
            'font-medium',
            row.onTimeRate >= 80
              ? 'text-emerald-600'
              : row.onTimeRate >= 60
                ? 'text-amber-600'
                : 'text-rose-600',
          )}
        >
          {row.onTimeRate.toFixed(0)}%
        </span>
      ),
    },
  ];

  const initialLoading = loading && !stats;
  const tawuniyaName = localName({ name: 'التعاونية', nameEn: 'Tawuniya' }, i18n.language);
  const meenaName = localName({ name: 'مينا', nameEn: 'Meena' }, i18n.language);

  return (
    <div className="space-y-6">
      {/* Header + entity toggle + refresh */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {t('dashboard.title') ?? 'Dashboard'}
          </h1>
          {lastUpdated && (
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {t('dashboard.updated')}{' '}
              {lastUpdated.toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin ? (
            <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-800 dark:bg-gray-900">
              {entityTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setSelectedEntity(tab.value)}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    selectedEntity === tab.value
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              {localName(user?.entity, i18n.language)}
            </span>
          )}

          <button
            onClick={() => load(true)}
            disabled={refreshing}
            title={t('dashboard.refresh')}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {initialLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface flex items-center gap-3 p-4">
                <div className="skeleton h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-5 w-12" />
                  <div className="skeleton h-3 w-16" />
                </div>
              </div>
            ))
          : kpis.map((kpi) => {
              const clickable = !!kpi.onClick;
              return (
                <Card
                  key={kpi.label}
                  padding={false}
                  className={cn(
                    'group relative flex items-center gap-3 p-4 transition-all duration-200 sm:gap-4',
                    clickable &&
                      'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus-visible:-translate-y-0.5 focus-visible:shadow-lg',
                  )}
                  {...(clickable
                    ? {
                        role: 'button',
                        tabIndex: 0,
                        onClick: kpi.onClick,
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            kpi.onClick?.();
                          }
                        },
                      }
                    : {})}
                >
                  <div
                    className={cn(
                      'shrink-0 rounded-xl p-2.5 ring-1 ring-inset ring-current/10 transition-transform duration-200 group-hover:scale-105 sm:p-3',
                      kpi.color,
                    )}
                  >
                    {kpi.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold tabular-nums tracking-tight text-gray-900 sm:text-2xl dark:text-gray-50">
                        {kpi.value}
                      </p>
                      {kpi.trend && <Delta metric={kpi.trend} goodIfUp={kpi.goodIfUp ?? true} />}
                    </div>
                    <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
                      {kpi.label}
                    </p>
                  </div>
                  {kpi.trend && kpi.spark && (
                    <div className="hidden shrink-0 self-center sm:block">
                      <Sparkline data={kpi.trend.series} color={kpi.spark} />
                    </div>
                  )}
                  {clickable && (
                    <ArrowUpRight className="absolute end-3 top-3 h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-gray-600" />
                  )}
                </Card>
              );
            })}
      </div>

      {/* Row 2: Entity Split + SLA Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t('entityResponsibilitySplit')}>
          <div className="h-72" dir="ltr">
            {initialLoading ? (
              <div className="skeleton h-full w-full rounded-xl" />
            ) : entitySplit.length === 0 ? (
              <ChartEmpty label={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entitySplit} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(148 163 184 / 0.12)' }} />
                  <Legend iconType="circle" />
                  <Bar dataKey="التعاونية" fill={COLORS.twn} radius={[6, 6, 0, 0]} maxBarSize={44} name={tawuniyaName} />
                  <Bar dataKey="مينا" fill={COLORS.meena} radius={[6, 6, 0, 0]} maxBarSize={44} name={meenaName} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title={t('slaTrendMonths')}>
          <div className="h-72" dir="ltr">
            {initialLoading ? (
              <div className="skeleton h-full w-full rounded-xl" />
            ) : slaTrend.length === 0 ? (
              <ChartEmpty label={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={slaTrend}>
                  <defs>
                    <linearGradient id="grad-twn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.twn} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={COLORS.twn} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-meena" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.meena} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={COLORS.meena} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="التعاونية" stroke={COLORS.twn} strokeWidth={2.5} fill="url(#grad-twn)" dot={false} activeDot={{ r: 5 }} name={tawuniyaName} />
                  <Area type="monotone" dataKey="مينا" stroke={COLORS.meena} strokeWidth={2.5} fill="url(#grad-meena)" dot={false} activeDot={{ r: 5 }} name={meenaName} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Row 3: Category Breakdown (full width) */}
      <Card title={t('categoryBreakdown')}>
        <div className="h-[420px]" dir="ltr">
          {initialLoading ? (
            <div className="skeleton h-full w-full rounded-xl" />
          ) : categoryBreakdown.length === 0 ? (
            <ChartEmpty label={t('dashboard.noData')} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  dataKey="category"
                  type="category"
                  width={isMobile ? 96 : 280}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => (isMobile && v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(148 163 184 / 0.12)' }} />
                <Legend iconType="circle" />
                <Bar dataKey="IN_PROGRESS" stackId="a" fill={COLORS.inProgress} name={t('inProgress')} maxBarSize={28} />
                <Bar dataKey="DELAYED" stackId="a" fill={COLORS.delayed} name={t('delayed')} maxBarSize={28} />
                <Bar dataKey="COMPLETED" stackId="a" fill={COLORS.completed} name={t('completed')} maxBarSize={28} />
                <Bar dataKey="ON_HOLD" stackId="a" fill={COLORS.onHold} name={t('onHold')} maxBarSize={28} />
                <Bar dataKey="DEPENDENT" stackId="a" fill={COLORS.dependent} name={t('dependent')} radius={[0, 6, 6, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Row 4: Aging */}
      <Card title={t('agingAnalysis')}>
        <div className="h-72" dir="ltr">
          {initialLoading ? (
            <div className="skeleton h-full w-full rounded-xl" />
          ) : aging.length === 0 ? (
            <ChartEmpty label={t('dashboard.noData')} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgb(148 163 184 / 0.12)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64} name={t('ticketsLabel')}>
                  {aging.map((_, i) => (
                    <Cell key={i} fill={COLORS.indigo} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Row 5: Team Accountability */}
      <Card title={t('teamAccountability')} padding={false}>
        <DataTable
          columns={teamColumns}
          data={teamData as unknown as Record<string, unknown>[]}
          loading={initialLoading}
          emptyMessage={t('noTeamData')}
          mobileCard={(row) => {
            const tm = row as unknown as TeamEntry;
            const cell = (label: string, value: React.ReactNode) => (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            );
            return (
              <div className="space-y-3">
                <p className="font-medium text-gray-900 dark:text-gray-100">{tm.team}</p>
                <div className="grid grid-cols-3 gap-3">
                  {cell(t('open'), tm.open)}
                  {cell(t('overdue'), <span className={tm.overdue > 0 ? 'text-rose-600' : ''}>{tm.overdue}</span>)}
                  {cell(t('completed'), tm.completed)}
                  {cell(t('avgSlaDays'), tm.avgSla.toFixed(1))}
                  {cell(
                    t('onTimePercent'),
                    <span
                      className={cn(
                        tm.onTimeRate >= 80
                          ? 'text-emerald-600'
                          : tm.onTimeRate >= 60
                            ? 'text-amber-600'
                            : 'text-rose-600',
                      )}
                    >
                      {tm.onTimeRate.toFixed(0)}%
                    </span>,
                  )}
                </div>
              </div>
            );
          }}
        />
      </Card>
    </div>
  );
}
