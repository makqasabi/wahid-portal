import { useTranslation } from 'react-i18next';
import { differenceInCalendarDays } from 'date-fns';
import type { Progress } from '@/types';
import { Badge, type BadgeProps } from '@/components/ui/Badge';

interface SlaBadgeProps {
  slaVarianceDays?: number | null;
  dueDate?: string;
  progress: Progress;
}

export function SlaBadge({ slaVarianceDays, dueDate, progress }: SlaBadgeProps) {
  const { t } = useTranslation();

  // Completed tickets: show variance
  if (progress === 'COMPLETED' && slaVarianceDays != null) {
    if (slaVarianceDays < 0) {
      return (
        <Badge variant="success">
          {t('sla.early', { count: Math.abs(slaVarianceDays) })}
        </Badge>
      );
    }
    if (slaVarianceDays === 0) {
      return <Badge variant="success">{t('sla.onTime')}</Badge>;
    }
    const variant: BadgeProps['variant'] = slaVarianceDays <= 7 ? 'warning' : 'danger';
    return (
      <Badge variant={variant}>
        {t('sla.late', { count: slaVarianceDays })}
      </Badge>
    );
  }

  // Non-completed tickets: compute from dueDate
  if (progress !== 'COMPLETED' && dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    const diff = differenceInCalendarDays(due, today);

    if (diff >= 0) {
      const variant: BadgeProps['variant'] = diff <= 3 ? 'warning' : 'info';
      return (
        <Badge variant={variant}>
          {t('sla.untilDue', { count: diff })}
        </Badge>
      );
    }

    const overdue = Math.abs(diff);
    return (
      <Badge variant="danger">
        {t('sla.overdue', { count: overdue })}
      </Badge>
    );
  }

  // Fallback
  return <Badge variant="neutral">{t('sla.na')}</Badge>;
}
