import { useTranslation } from 'react-i18next';
import type { Priority } from '@/types';
import { Badge, type BadgeProps } from '@/components/ui/Badge';

interface PriorityBadgeProps {
  priority: Priority;
}

const priorityVariant: Record<Priority, BadgeProps['variant']> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'default',
  LOW: 'neutral',
};

const priorityKey: Record<Priority, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const { t } = useTranslation();
  const variant = priorityVariant[priority] ?? ('default' as const);
  const label = t(priorityKey[priority] ?? priority);

  return <Badge variant={variant}>{label}</Badge>;
}
