import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Gauge,
  PauseCircle,
  TrendingUp,
} from 'lucide-react';
import { dashboardApi, referenceApi } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
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

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { isSuperAdmin, user } = useAuth();
  const [selectedEntity, setSelectedEntity] = useState('');

  const [loading, setLoading] = useState(true);
  const [entityTabs, setEntityTabs] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('all') },
  ]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [entitySplit, setEntitySplit] = useState<EntitySplitEntry[]>([]);
  const [slaTrend, setSlaTrend] = useState<SlaTrendEntry[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryEntry[]>([]);
  const [aging, setAging] = useState<AgingEntry[]>([]);
  const [teamData, setTeamData] = useState<TeamEntry[]>([]);

  // Fetch entity tabs
  useEffect(() => {
    referenceApi.getEntities().then((data: Entity[]) =>
      setEntityTabs([
        { value: '', label: t('all') },
        ...data.map((e) => ({ value: e.id, label: localName(e, i18n.language) })),
      ]),
    ).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const eid = selectedEntity || undefined;
    Promise.all([
      dashboardApi.getStats(eid),
      dashboardApi.getEntitySplit(eid),
      dashboardApi.getSlaTrend(eid),
      dashboardApi.getCategoryBreakdown(eid),
      dashboardApi.getAging(eid),
      dashboardApi.getTeamAccountability(eid),
    ])
      .then(([s, es, st, cb, ag, ta]) => {
        setStats(s as DashboardStats);

        // Translate status keys
        const statusLabel: Record<string, string> = {
          IN_PROGRESS: t('inProgress'),
          DELAYED: t('delayed'),
          COMPLETED: t('completed'),
          ON_HOLD: t('onHold'),
          DEPENDENT: t('dependent'),
        };

        // Pivot entity-split: flat rows → {status, التعاونية, مينا}
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

        // Pivot sla-trend: flat rows → {month, التعاونية, مينا}
        const stRaw = st as { month: string; entityName: string; onTimeRate: number }[];
        const stMap = new Map<string, SlaTrendEntry>();
        for (const row of stRaw) {
          if (!stMap.has(row.month)) stMap.set(row.month, { month: row.month, التعاونية: 0, مينا: 0 });
          const entry = stMap.get(row.month)!;
          if (row.entityName === 'التعاونية') entry.التعاونية = row.onTimeRate;
          else entry.مينا = row.onTimeRate;
        }
        setSlaTrend([...stMap.values()]);

        // Pivot category-breakdown: flat rows → {category, IN_PROGRESS, DELAYED, ...}
        const isEn = i18n.language !== 'ar';
        const cbRaw = cb as { categoryName: string; categoryNameEn?: string | null; status: string; count: number }[];
        const cbMap = new Map<string, CategoryEntry>();
        for (const row of cbRaw) {
          const catLabel = (isEn && row.categoryNameEn) ? row.categoryNameEn : row.categoryName;
          if (!cbMap.has(catLabel)) {
            cbMap.set(catLabel, { category: catLabel, IN_PROGRESS: 0, DELAYED: 0, COMPLETED: 0, ON_HOLD: 0, DEPENDENT: 0 });
          }
          const entry = cbMap.get(catLabel)!;
          (entry as Record<string, unknown>)[row.status] = row.count;
        }
        setCategoryBreakdown([...cbMap.values()]);

        // Translate aging buckets
        const agRaw = ag as AgingEntry[];
        const bucketLabel: Record<string, string> = {
          '0-7': `0-7 ${t('days')}`,
          '8-14': `8-14 ${t('days')}`,
          '15-30': `15-30 ${t('days')}`,
          '30+': `+30 ${t('days')}`,
        };
        setAging(agRaw.map(a => ({ ...a, bucket: bucketLabel[a.bucket] ?? a.bucket })));

        // Transform team-accountability
        const taRaw = ta as { teamName: string; teamNameEn?: string | null; entityName: string; entityNameEn?: string | null; open: number; overdue: number; completed: number; avgSlaVariance: number | null; onTimeRate: number | null }[];
        setTeamData(taRaw.map((r) => {
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
        }));
      })
      .catch(() => {
        // non-critical — page will show empty state
      })
      .finally(() => setLoading(false));
  }, [selectedEntity, i18n.language]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const kpis: {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
  }[] = stats
    ? [
        {
          label: t('totalOpen'),
          value: stats.totalOpen,
          icon: <Clock className="h-6 w-6" />,
          color: 'text-blue-600 bg-blue-50',
        },
        {
          label: t('overdue'),
          value: stats.overdue,
          icon: <AlertTriangle className="h-6 w-6" />,
          color: 'text-red-600 bg-red-50',
        },
        {
          label: t('completedThisMonth'),
          value: stats.completedThisMonth,
          icon: <CheckCircle className="h-6 w-6" />,
          color: 'text-green-600 bg-green-50',
        },
        {
          label: t('avgSlaVariance'),
          value: `${stats.avgSlaVariance >= 0 ? '+' : ''}${stats.avgSlaVariance.toFixed(1)}d`,
          icon: <Gauge className="h-6 w-6" />,
          color: 'text-purple-600 bg-purple-50',
        },
        {
          label: t('onTimeRate'),
          value: `${stats.onTimeRate.toFixed(0)}%`,
          icon: <TrendingUp className="h-6 w-6" />,
          color: 'text-teal-600 bg-teal-50',
        },
        {
          label: t('onHoldDependent'),
          value: stats.onHoldDependent,
          icon: <PauseCircle className="h-6 w-6" />,
          color: 'text-gray-600 bg-gray-100',
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
        <span className={row.overdue > 0 ? 'font-semibold text-red-600' : ''}>
          {row.overdue}
        </span>
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
              ? 'text-green-600'
              : row.onTimeRate >= 60
                ? 'text-yellow-600'
                : 'text-red-600',
          )}
        >
          {row.onTimeRate.toFixed(0)}%
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header + entity toggle */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('dashboard.title') ?? 'Dashboard'}
        </h1>

        {isSuperAdmin ? (
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            {entityTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedEntity(tab.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  selectedEntity === tab.value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {localName(user?.entity, i18n.language)}
          </span>
        )}
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="flex items-center gap-4">
            <div className={cn('rounded-xl p-3', kpi.color)}>{kpi.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Row 2: Entity Split + SLA Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title={t('entityResponsibilitySplit')}>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={entitySplit}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="التعاونية" fill="#2563eb" radius={[4, 4, 0, 0]} name={localName({name: 'التعاونية', nameEn: 'Tawuniya'}, i18n.language)} />
                <Bar dataKey="مينا" fill="#f59e0b" radius={[4, 4, 0, 0]} name={localName({name: 'مينا', nameEn: 'Meena'}, i18n.language)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title={t('slaTrendMonths')}>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slaTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="التعاونية"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name={localName({name: 'التعاونية', nameEn: 'Tawuniya'}, i18n.language)}
                />
                <Line
                  type="monotone"
                  dataKey="مينا"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name={localName({name: 'مينا', nameEn: 'Meena'}, i18n.language)}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Row 3: Category Breakdown (full width) */}
      <Card title={t('categoryBreakdown')}>
        <div className="h-[420px]" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryBreakdown} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="category"
                type="category"
                width={280}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="IN_PROGRESS" stackId="a" fill="#3b82f6" name={t('inProgress')} />
              <Bar dataKey="DELAYED" stackId="a" fill="#ef4444" name={t('delayed')} />
              <Bar dataKey="COMPLETED" stackId="a" fill="#22c55e" name={t('completed')} />
              <Bar dataKey="ON_HOLD" stackId="a" fill="#9ca3af" name={t('onHold')} />
              <Bar dataKey="DEPENDENT" stackId="a" fill="#f97316" name={t('dependent')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 4: Aging */}
      <Card title={t('agingAnalysis')}>
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={aging}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('ticketsLabel')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 4: Team Accountability */}
      <Card title={t('teamAccountability')}>
        <DataTable
          columns={teamColumns}
          data={teamData as unknown as Record<string, unknown>[]}
          emptyMessage={t('noTeamData')}
        />
      </Card>
    </div>
  );
}
