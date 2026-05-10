import { useTranslation } from 'react-i18next';
import type { Progress } from '@/types';
import { Badge, type BadgeProps } from '@/components/ui/Badge';

interface StatusBadgeProps {
  status: Progress;
}

const statusVariant: Record<Progress, BadgeProps['variant']> = {
  IN_PROGRESS: 'info',
  DELAYED: 'danger',
  COMPLETED: 'success',
  ON_HOLD: 'neutral',
  DEPENDENT: 'warning',
};

const statusKey: Record<Progress, string> = {
  IN_PROGRESS: 'inProgress',
  DELAYED: 'delayed',
  COMPLETED: 'completed',
  ON_HOLD: 'onHold',
  DEPENDENT: 'dependent',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const variant = statusVariant[status] ?? ('default' as const);
  const label = t(statusKey[status] ?? status);

  return <Badge variant={variant}>{label}</Badge>;
}
