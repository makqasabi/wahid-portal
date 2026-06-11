import { useTranslation } from 'react-i18next';
import type { Progress } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { useWorkflow, workflowLabel } from '@/hooks/useWorkflow';

interface StatusBadgeProps {
  status: Progress;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { i18n } = useTranslation();
  const { statusByKey } = useWorkflow();
  const def = statusByKey.get(status);
  const label = workflowLabel(def, i18n.language, status);

  return (
    <Badge colorHex={def?.color ?? '#64748b'} dot>
      {label}
    </Badge>
  );
}
