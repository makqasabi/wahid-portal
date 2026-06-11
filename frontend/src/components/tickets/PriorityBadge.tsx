import { useTranslation } from 'react-i18next';
import type { Priority } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { useWorkflow, workflowLabel } from '@/hooks/useWorkflow';

interface PriorityBadgeProps {
  priority: Priority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const { i18n } = useTranslation();
  const { priorityByKey } = useWorkflow();
  const def = priorityByKey.get(priority);
  const label = workflowLabel(def, i18n.language, priority);

  return <Badge colorHex={def?.color ?? '#64748b'}>{label}</Badge>;
}
