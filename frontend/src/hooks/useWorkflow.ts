import { useEffect, useState } from 'react';
import { referenceApi } from '@/api/client';
import type { WorkflowStatus, WorkflowPriority } from '@/types';

/**
 * Dynamic ticket workflow (admin-defined statuses/priorities), fetched once
 * per session and shared module-wide. Components fall back to the seeded
 * defaults while loading, so badges never flash empty.
 */

interface WorkflowData {
  statuses: WorkflowStatus[];
  priorities: WorkflowPriority[];
}

// Seeded defaults double as the pre-fetch fallback (matches the DB seed).
const FALLBACK: WorkflowData = {
  statuses: [
    { key: 'IN_PROGRESS', name: 'قيد التنفيذ', nameEn: 'In Progress', color: '#0ea5e9', isDefault: true, isClosed: false, pausesSla: false, isOverdueFlag: false, transitionsTo: ['COMPLETED', 'ON_HOLD', 'DEPENDENT'] },
    { key: 'DELAYED', name: 'متأخر', nameEn: 'Delayed', color: '#f43f5e', isDefault: false, isClosed: false, pausesSla: false, isOverdueFlag: true, transitionsTo: ['COMPLETED', 'ON_HOLD', 'IN_PROGRESS'] },
    { key: 'COMPLETED', name: 'مكتمل', nameEn: 'Completed', color: '#10b981', isDefault: false, isClosed: true, pausesSla: false, isOverdueFlag: false, transitionsTo: ['IN_PROGRESS'] },
    { key: 'ON_HOLD', name: 'قيد الانتظار', nameEn: 'On Hold', color: '#94a3b8', isDefault: false, isClosed: false, pausesSla: true, isOverdueFlag: false, transitionsTo: ['IN_PROGRESS'] },
    { key: 'DEPENDENT', name: 'معلق على آخر', nameEn: 'Dependent', color: '#f97316', isDefault: false, isClosed: false, pausesSla: true, isOverdueFlag: false, transitionsTo: ['IN_PROGRESS'] },
  ],
  priorities: [
    { key: 'CRITICAL', name: 'حرج', nameEn: 'Critical', color: '#e11d48', isDefault: false },
    { key: 'HIGH', name: 'عالي', nameEn: 'High', color: '#f59e0b', isDefault: false },
    { key: 'MEDIUM', name: 'متوسط', nameEn: 'Medium', color: '#64748b', isDefault: true },
    { key: 'LOW', name: 'منخفض', nameEn: 'Low', color: '#94a3b8', isDefault: false },
  ],
};

let cached: WorkflowData | null = null;
let inflight: Promise<WorkflowData> | null = null;
const listeners = new Set<(d: WorkflowData) => void>();

function fetchWorkflow(): Promise<WorkflowData> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = referenceApi
      .getWorkflow()
      .then((d) => {
        cached = d;
        listeners.forEach((l) => l(d));
        return d;
      })
      .catch(() => {
        inflight = null; // allow retry on next mount
        return FALLBACK;
      });
  }
  return inflight;
}

/** Force a refetch (after the admin edits the workflow). */
export function invalidateWorkflow(): void {
  cached = null;
  inflight = null;
  void fetchWorkflow();
}

export function useWorkflow() {
  const [data, setData] = useState<WorkflowData>(cached ?? FALLBACK);

  useEffect(() => {
    let mounted = true;
    void fetchWorkflow().then((d) => {
      if (mounted) setData(d);
    });
    const listener = (d: WorkflowData) => setData({ ...d });
    listeners.add(listener);
    return () => {
      mounted = false;
      listeners.delete(listener);
    };
  }, []);

  const statusByKey = new Map(data.statuses.map((s) => [s.key, s]));
  const priorityByKey = new Map(data.priorities.map((p) => [p.key, p]));

  return {
    statuses: data.statuses,
    priorities: data.priorities,
    statusByKey,
    priorityByKey,
    defaultStatus: data.statuses.find((s) => s.isDefault) ?? data.statuses[0],
    defaultPriority: data.priorities.find((p) => p.isDefault) ?? data.priorities[0],
  };
}

/** Localized label for a workflow item (AR name / EN nameEn). */
export function workflowLabel(
  item: { name: string; nameEn?: string | null } | undefined,
  lang: string,
  fallback: string,
): string {
  if (!item) return fallback;
  return lang.startsWith('ar') ? item.name : item.nameEn || item.name;
}
