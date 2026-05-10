import {
  Ticket,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Pause,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types';

interface KpiCardsProps {
  stats: DashboardStats;
}

interface KpiDef {
  key: keyof DashboardStats;
  label: string;
  icon: React.ElementType;
  color: string; // text color
  bg: string; // icon background
  format: (v: number) => string;
}

const kpis: KpiDef[] = [
  {
    key: 'totalOpen',
    label: 'Total Open',
    icon: Ticket,
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    format: (v) => String(v),
  },
  {
    key: 'overdue',
    label: 'Overdue',
    icon: AlertTriangle,
    color: 'text-red-700',
    bg: 'bg-red-100',
    format: (v) => String(v),
  },
  {
    key: 'completedThisMonth',
    label: 'Completed This Month',
    icon: CheckCircle,
    color: 'text-green-700',
    bg: 'bg-green-100',
    format: (v) => String(v),
  },
  {
    key: 'avgSlaVariance',
    label: 'Avg SLA Variance',
    icon: Clock,
    color: 'text-indigo-700',
    bg: 'bg-indigo-100',
    format: (v) => `${v > 0 ? '+' : ''}${v} days`,
  },
  {
    key: 'onTimeRate',
    label: 'On-Time Rate',
    icon: TrendingUp,
    color: 'text-teal-700',
    bg: 'bg-teal-100',
    format: (v) => `${v}%`,
  },
  {
    key: 'onHoldDependent',
    label: 'On Hold + Dependent',
    icon: Pause,
    color: 'text-gray-700',
    bg: 'bg-gray-100',
    format: (v) => String(v),
  },
];

export function KpiCards({ stats }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        const value = stats[kpi.key];
        return (
          <Card key={kpi.key} className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl',
                kpi.bg,
              )}
            >
              <Icon className={cn('h-6 w-6', kpi.color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold', kpi.color)}>
                {kpi.format(value)}
              </p>
              <p className="text-sm text-gray-500">{kpi.label}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
