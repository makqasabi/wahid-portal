/**
 * Admin "customize everything" UI (SUPER_ADMIN):
 *  - SettingsTab: branding, SLA & report schedules, integration toggles,
 *    notification templates — all saved live, no redeploy.
 *  - WorkflowTab: fully dynamic ticket statuses (labels, colors, semantic
 *    flags, allowed transitions) and priorities.
 *  - CategoryFieldsModal: per-category custom ticket fields (form builder),
 *    opened from the Categories tab.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Play, RotateCcw } from 'lucide-react';
import { adminConfigApi } from '@/api/client';
import { invalidateWorkflow } from '@/hooks/useWorkflow';
import { invalidateBranding } from '@/hooks/useBranding';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type {
  AppSettings,
  AdminWorkflowStatus,
  AdminWorkflowPriority,
  CategoryFieldDef,
} from '@/types';

function errMsg(e: unknown, fallback: string): string {
  const anyE = e as { response?: { data?: { error?: string } } };
  return anyE?.response?.data?.error ?? fallback;
}

/* ============================= Settings Tab ============================= */

export function SettingsTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    adminConfigApi
      .getSettings()
      .then((d) => setSettings(d.settings))
      .catch(() => toast.error(t('cfg.saveFailed')));
  }, []);

  const save = async (group: string, value: unknown) => {
    setSaving(group);
    try {
      const updated = await adminConfigApi.updateSettings(group, value);
      setSettings(updated);
      if (group === 'branding') invalidateBranding();
      toast.success(t('cfg.saved'));
    } catch (e) {
      toast.error(errMsg(e, t('cfg.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const reset = async (group: string) => {
    setSaving(group);
    try {
      const updated = await adminConfigApi.resetSettings(group);
      setSettings(updated);
      if (group === 'branding') invalidateBranding();
      toast.success(t('cfg.saved'));
    } catch (e) {
      toast.error(errMsg(e, t('cfg.saveFailed')));
    } finally {
      setSaving(null);
    }
  };

  const runJob = async (job: 'sla-check' | 'weekly-report') => {
    try {
      await adminConfigApi.runJob(job);
      toast.success(t('cfg.jobStarted'));
    } catch (e) {
      toast.error(errMsg(e, t('cfg.saveFailed')));
    }
  };

  if (!settings) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BrandingSection settings={settings} onSave={save} onReset={reset} saving={saving} />
      <SlaReportsSection
        settings={settings}
        onSave={save}
        onReset={reset}
        saving={saving}
        onRunJob={runJob}
      />
      <TogglesSection settings={settings} onSave={save} saving={saving} />
      <TemplatesSection settings={settings} onSave={save} onReset={reset} saving={saving} />
    </div>
  );
}

interface SectionProps {
  settings: AppSettings;
  onSave: (group: string, value: unknown) => Promise<void>;
  onReset?: (group: string) => Promise<void>;
  saving: string | null;
  onRunJob?: (job: 'sla-check' | 'weekly-report') => Promise<void>;
}

function SectionActions({
  group,
  onSave,
  onReset,
  saving,
  value,
}: {
  group: string;
  onSave: SectionProps['onSave'];
  onReset?: SectionProps['onReset'];
  saving: string | null;
  value: unknown;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" loading={saving === group} onClick={() => void onSave(group, value)}>
        {t('cfg.save')}
      </Button>
      {onReset && (
        <Button
          size="sm"
          variant="outline"
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          onClick={() => void onReset(group)}
        >
          {t('cfg.reset')}
        </Button>
      )}
    </div>
  );
}

function BrandingSection({ settings, onSave, onReset, saving }: SectionProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(settings.branding);
  useEffect(() => setForm(settings.branding), [settings.branding]);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Card title={t('cfg.branding')}>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('cfg.brandingDesc')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label={t('cfg.portalNameAr')} value={form.portalNameAr} onChange={(e) => set('portalNameAr', e.target.value)} />
        <Input label={t('cfg.portalNameEn')} value={form.portalNameEn} onChange={(e) => set('portalNameEn', e.target.value)} />
        <Input label={t('cfg.fullNameAr')} value={form.fullNameAr} onChange={(e) => set('fullNameAr', e.target.value)} />
        <Input label={t('cfg.fullNameEn')} value={form.fullNameEn} onChange={(e) => set('fullNameEn', e.target.value)} />
        <Input label={t('cfg.taglineAr')} value={form.taglineAr} onChange={(e) => set('taglineAr', e.target.value)} />
        <Input label={t('cfg.taglineEn')} value={form.taglineEn} onChange={(e) => set('taglineEn', e.target.value)} />
        <Input label={t('cfg.logoUrl')} value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://..." />
        <Input label={t('cfg.emailSignature')} value={form.emailSignature} onChange={(e) => set('emailSignature', e.target.value)} />
        <ColorInput label={t('cfg.emailButtonColor')} value={form.emailButtonColor} onChange={(v) => set('emailButtonColor', v)} />
      </div>
      <SectionActions group="branding" onSave={onSave} onReset={onReset} saving={saving} value={form} />
    </Card>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#64748b'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-gray-300 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-900"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </div>
  );
}

function SlaReportsSection({ settings, onSave, onReset, saving, onRunJob }: SectionProps) {
  const { t } = useTranslation();
  const [sla, setSla] = useState(settings.sla);
  const [reports, setReports] = useState({
    ...settings.reports,
    recipientsText: settings.reports.weeklyRecipients.join(', '),
  });
  useEffect(() => setSla(settings.sla), [settings.sla]);
  useEffect(
    () =>
      setReports({
        ...settings.reports,
        recipientsText: settings.reports.weeklyRecipients.join(', '),
      }),
    [settings.reports],
  );

  const reportsPayload = {
    weeklyEnabled: reports.weeklyEnabled,
    weeklyCron: reports.weeklyCron,
    weeklyRecipients: reports.recipientsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.includes('@')),
  };

  return (
    <Card title={t('cfg.slaReports')}>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('cfg.slaReportsDesc')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t('cfg.defaultWarningDays')}
          type="number"
          value={String(sla.defaultWarningDays)}
          onChange={(e) => setSla((p) => ({ ...p, defaultWarningDays: Number(e.target.value) }))}
        />
        <div>
          <Input
            label={t('cfg.checkerCron')}
            value={sla.checkerCron}
            onChange={(e) => setSla((p) => ({ ...p, checkerCron: e.target.value }))}
            className="font-mono"
          />
          {onRunJob && (
            <Button size="sm" variant="ghost" className="mt-1" icon={<Play className="h-3.5 w-3.5" />} onClick={() => void onRunJob('sla-check')}>
              {t('cfg.runNow')}
            </Button>
          )}
        </div>
      </div>
      <SectionActions group="sla" onSave={onSave} onReset={onReset} saving={saving} value={sla} />

      <hr className="my-5 border-gray-100 dark:border-gray-800" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label={t('cfg.weeklyEnabled')}
          options={[
            { value: 'true', label: t('cfg.enabled') },
            { value: 'false', label: t('cfg.disabled') },
          ]}
          value={String(reports.weeklyEnabled)}
          onChange={(e) => setReports((p) => ({ ...p, weeklyEnabled: e.target.value === 'true' }))}
        />
        <div>
          <Input
            label={t('cfg.weeklyCron')}
            value={reports.weeklyCron}
            onChange={(e) => setReports((p) => ({ ...p, weeklyCron: e.target.value }))}
            className="font-mono"
          />
          {onRunJob && (
            <Button size="sm" variant="ghost" className="mt-1" icon={<Play className="h-3.5 w-3.5" />} onClick={() => void onRunJob('weekly-report')}>
              {t('cfg.runNow')}
            </Button>
          )}
        </div>
        <div className="sm:col-span-2">
          <Input
            label={t('cfg.weeklyRecipients')}
            value={reports.recipientsText}
            onChange={(e) => setReports((p) => ({ ...p, recipientsText: e.target.value }))}
            placeholder="ops@company.com, manager@company.com"
          />
        </div>
      </div>
      <SectionActions group="reports" onSave={onSave} saving={saving} value={reportsPayload} />
    </Card>
  );
}

function TogglesSection({ settings, onSave, saving }: SectionProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(settings.toggles);
  useEffect(() => setForm(settings.toggles), [settings.toggles]);

  const options: SelectOption[] = [
    { value: 'null', label: t('cfg.followEnv') },
    { value: 'true', label: t('cfg.enabled') },
    { value: 'false', label: t('cfg.disabled') },
  ];
  const toVal = (v: boolean | null) => (v === null ? 'null' : String(v));
  const fromVal = (s: string): boolean | null => (s === 'null' ? null : s === 'true');

  return (
    <Card title={t('cfg.toggles')}>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('cfg.togglesDesc')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select label="WhatsApp" options={options} value={toVal(form.whatsapp)} onChange={(e) => setForm((p) => ({ ...p, whatsapp: fromVal(e.target.value) }))} />
        <Select label="IMAP (inbound email)" options={options} value={toVal(form.imap)} onChange={(e) => setForm((p) => ({ ...p, imap: fromVal(e.target.value) }))} />
        <Select label="SSO (Microsoft)" options={options} value={toVal(form.oidc)} onChange={(e) => setForm((p) => ({ ...p, oidc: fromVal(e.target.value) }))} />
      </div>
      <SectionActions group="toggles" onSave={onSave} saving={saving} value={form} />
    </Card>
  );
}

function TemplatesSection({ settings, onSave, onReset, saving }: SectionProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(settings.templates);
  useEffect(() => setForm(settings.templates), [settings.templates]);

  const set = (type: string, k: 'subject' | 'body', v: string) =>
    setForm((p) => ({ ...p, [type]: { ...p[type], [k]: v } }));

  return (
    <Card title={t('cfg.templates')}>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('cfg.templatesDesc')}</p>
      <div className="space-y-4">
        {Object.entries(form).map(([type, tpl]) => (
          <div key={type} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{type}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label={t('cfg.subject')} value={tpl.subject} onChange={(e) => set(type, 'subject', e.target.value)} />
              <Input label={t('cfg.body')} value={tpl.body} onChange={(e) => set(type, 'body', e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <SectionActions group="templates" onSave={onSave} onReset={onReset} saving={saving} value={form} />
    </Card>
  );
}

/* ============================= Workflow Tab ============================= */

const EMPTY_STATUS: Partial<AdminWorkflowStatus> = {
  key: '',
  name: '',
  nameEn: '',
  color: '#64748b',
  sortOrder: 0,
  isActive: true,
  isDefault: false,
  isClosed: false,
  pausesSla: false,
  isOverdueFlag: false,
  transitionsTo: [],
};

export function WorkflowTab() {
  const { t, i18n } = useTranslation();
  const [statuses, setStatuses] = useState<AdminWorkflowStatus[]>([]);
  const [priorities, setPriorities] = useState<AdminWorkflowPriority[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusModal, setStatusModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<AdminWorkflowStatus | null>(null);
  const [statusForm, setStatusForm] = useState<Partial<AdminWorkflowStatus>>(EMPTY_STATUS);

  const [prioModal, setPrioModal] = useState(false);
  const [editingPrio, setEditingPrio] = useState<AdminWorkflowPriority | null>(null);
  const [prioForm, setPrioForm] = useState<Partial<AdminWorkflowPriority>>(EMPTY_STATUS);

  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        adminConfigApi.getStatuses(),
        adminConfigApi.getPriorities(),
      ]);
      setStatuses(s);
      setPriorities(p);
    } catch {
      toast.error(t('wf.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const label = (x: { name: string; nameEn?: string | null }) =>
    i18n.language.startsWith('ar') ? x.name : x.nameEn || x.name;

  const openStatus = (s: AdminWorkflowStatus | null) => {
    setEditingStatus(s);
    setStatusForm(s ? { ...s } : { ...EMPTY_STATUS, sortOrder: statuses.length });
    setStatusModal(true);
  };

  const saveStatus = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: statusForm.name,
        nameEn: statusForm.nameEn || null,
        color: statusForm.color,
        sortOrder: Number(statusForm.sortOrder ?? 0),
        isActive: statusForm.isActive,
        isDefault: statusForm.isDefault,
        isClosed: statusForm.isClosed,
        pausesSla: statusForm.pausesSla,
        isOverdueFlag: statusForm.isOverdueFlag,
        transitionsTo: statusForm.transitionsTo ?? [],
      };
      if (editingStatus) {
        await adminConfigApi.updateStatus(editingStatus.id, payload);
      } else {
        await adminConfigApi.createStatus({ ...payload, key: statusForm.key } as never);
      }
      invalidateWorkflow();
      toast.success(t('wf.saved'));
      setStatusModal(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const removeStatus = async (s: AdminWorkflowStatus) => {
    if (!window.confirm(t('wf.deleteConfirm'))) return;
    try {
      await adminConfigApi.deleteStatus(s.id);
      invalidateWorkflow();
      toast.success(t('wf.saved'));
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    }
  };

  const openPrio = (p: AdminWorkflowPriority | null) => {
    setEditingPrio(p);
    setPrioForm(p ? { ...p } : { key: '', name: '', nameEn: '', color: '#64748b', sortOrder: priorities.length, isActive: true, isDefault: false });
    setPrioModal(true);
  };

  const savePrio = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: prioForm.name,
        nameEn: prioForm.nameEn || null,
        color: prioForm.color,
        sortOrder: Number(prioForm.sortOrder ?? 0),
        isActive: prioForm.isActive,
        isDefault: prioForm.isDefault,
      };
      if (editingPrio) {
        await adminConfigApi.updatePriority(editingPrio.id, payload);
      } else {
        await adminConfigApi.createPriority({ ...payload, key: prioForm.key } as never);
      }
      invalidateWorkflow();
      toast.success(t('wf.saved'));
      setPrioModal(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const removePrio = async (p: AdminWorkflowPriority) => {
    if (!window.confirm(t('wf.deleteConfirm'))) return;
    try {
      await adminConfigApi.deletePriority(p.id);
      invalidateWorkflow();
      toast.success(t('wf.saved'));
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    }
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Statuses */}
      <Card title={t('wf.statuses')}>
        <div className="mb-3">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openStatus(null)}>
            {t('wf.addStatus')}
          </Button>
        </div>
        <div className="space-y-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
            >
              <Badge colorHex={s.color} dot>
                {label(s)}
              </Badge>
              <code className="text-xs text-gray-400">{s.key}</code>
              <span className="text-xs text-gray-400">
                {s.ticketCount} {t('wf.tickets')}
              </span>
              <div className="flex flex-wrap gap-1">
                {s.isDefault && <Badge variant="brand">{t('wf.isDefault').split(' ')[0]} ✓</Badge>}
                {s.isClosed && <Badge variant="success">✓</Badge>}
                {s.pausesSla && <Badge variant="neutral">⏸</Badge>}
                {s.isOverdueFlag && <Badge variant="danger">!</Badge>}
                {!s.isActive && <Badge variant="neutral">{t('wf.inactive')}</Badge>}
              </div>
              <span className="text-xs text-gray-400">
                → {s.transitionsTo.map((k) => label(statuses.find((x) => x.key === k) ?? { name: k })).join(', ') || '—'}
              </span>
              <div className="ms-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => openStatus(s)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void removeStatus(s)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Priorities */}
      <Card title={t('wf.priorities')}>
        <div className="mb-3">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openPrio(null)}>
            {t('wf.addPriority')}
          </Button>
        </div>
        <div className="space-y-2">
          {priorities.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
            >
              <Badge colorHex={p.color}>{label(p)}</Badge>
              <code className="text-xs text-gray-400">{p.key}</code>
              <span className="text-xs text-gray-400">
                {p.ticketCount} {t('wf.tickets')}
              </span>
              {p.isDefault && <Badge variant="brand">✓</Badge>}
              {!p.isActive && <Badge variant="neutral">{t('wf.inactive')}</Badge>}
              <div className="ms-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => openPrio(p)}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void removePrio(p)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Status editor modal */}
      <Modal
        open={statusModal}
        onOpenChange={setStatusModal}
        title={editingStatus ? t('wf.editStatus') : t('wf.addStatus')}
        size="lg"
      >
        <div className="space-y-3">
          {!editingStatus && (
            <Input
              label={t('wf.key')}
              value={statusForm.key ?? ''}
              onChange={(e) =>
                setStatusForm((p) => ({ ...p, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))
              }
              placeholder="WAITING_CUSTOMER"
              className="font-mono"
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={t('wf.labelAr')} value={statusForm.name ?? ''} onChange={(e) => setStatusForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label={t('wf.labelEn')} value={statusForm.nameEn ?? ''} onChange={(e) => setStatusForm((p) => ({ ...p, nameEn: e.target.value }))} />
            <ColorInput label={t('wf.color')} value={statusForm.color ?? '#64748b'} onChange={(v) => setStatusForm((p) => ({ ...p, color: v }))} />
            <Input label={t('wf.sortOrder')} type="number" value={String(statusForm.sortOrder ?? 0)} onChange={(e) => setStatusForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('wf.flags')}</p>
            <div className="space-y-2">
              {(
                [
                  ['isDefault', t('wf.isDefault')],
                  ['isClosed', t('wf.isClosed')],
                  ['pausesSla', t('wf.pausesSla')],
                  ['isOverdueFlag', t('wf.isOverdueFlag')],
                  ['isActive', t('wf.active')],
                ] as const
              ).map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={Boolean(statusForm[k])}
                    onChange={(e) => setStatusForm((p) => ({ ...p, [k]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-twn-600 focus:ring-twn-500"
                  />
                  {lbl}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{t('wf.transitions')}</p>
            <div className="flex flex-wrap gap-2">
              {statuses
                .filter((s) => s.key !== statusForm.key)
                .map((s) => {
                  const selected = (statusForm.transitionsTo ?? []).includes(s.key);
                  return (
                    <label
                      key={s.key}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-twn-300 bg-twn-50 text-twn-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 dark:border-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() =>
                          setStatusForm((p) => ({
                            ...p,
                            transitionsTo: selected
                              ? (p.transitionsTo ?? []).filter((k) => k !== s.key)
                              : [...(p.transitionsTo ?? []), s.key],
                          }))
                        }
                      />
                      {label(s)}
                    </label>
                  );
                })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStatusModal(false)}>
              {t('cancel')}
            </Button>
            <Button loading={submitting} onClick={() => void saveStatus()}>
              {t('cfg.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Priority editor modal */}
      <Modal
        open={prioModal}
        onOpenChange={setPrioModal}
        title={editingPrio ? t('wf.editPriority') : t('wf.addPriority')}
      >
        <div className="space-y-3">
          {!editingPrio && (
            <Input
              label={t('wf.key')}
              value={prioForm.key ?? ''}
              onChange={(e) =>
                setPrioForm((p) => ({ ...p, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))
              }
              placeholder="URGENT"
              className="font-mono"
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={t('wf.labelAr')} value={prioForm.name ?? ''} onChange={(e) => setPrioForm((p) => ({ ...p, name: e.target.value }))} />
            <Input label={t('wf.labelEn')} value={prioForm.nameEn ?? ''} onChange={(e) => setPrioForm((p) => ({ ...p, nameEn: e.target.value }))} />
            <ColorInput label={t('wf.color')} value={prioForm.color ?? '#64748b'} onChange={(v) => setPrioForm((p) => ({ ...p, color: v }))} />
            <Input label={t('wf.sortOrder')} type="number" value={String(prioForm.sortOrder ?? 0)} onChange={(e) => setPrioForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))} />
          </div>
          <div className="space-y-2">
            {(
              [
                ['isDefault', t('wf.isDefault')],
                ['isActive', t('wf.active')],
              ] as const
            ).map(([k, lbl]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={Boolean(prioForm[k])}
                  onChange={(e) => setPrioForm((p) => ({ ...p, [k]: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-twn-600 focus:ring-twn-500"
                />
                {lbl}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPrioModal(false)}>
              {t('cancel')}
            </Button>
            <Button loading={submitting} onClick={() => void savePrio()}>
              {t('cfg.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ======================== Category Fields Modal ======================== */

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select'] as const;

export function CategoryFieldsModal({
  categoryId,
  categoryName,
  open,
  onClose,
}: {
  categoryId: string;
  categoryName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [fields, setFields] = useState<CategoryFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CategoryFieldDef | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<CategoryFieldDef> & { optionsText?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!categoryId) return;
    setLoading(true);
    try {
      setFields(await adminConfigApi.getCategoryFields(categoryId));
    } catch {
      toast.error(t('wf.saveFailed'));
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (open) {
      setShowForm(false);
      void load();
    }
  }, [open, load]);

  const openForm = (f: CategoryFieldDef | null) => {
    setEditing(f);
    setForm(
      f
        ? { ...f, optionsText: f.options.join('\n') }
        : { key: '', label: '', labelEn: '', type: 'text', required: false, sortOrder: fields.length, optionsText: '' },
    );
    setShowForm(true);
  };

  const save = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        label: form.label,
        labelEn: form.labelEn || null,
        type: form.type,
        required: form.required,
        sortOrder: Number(form.sortOrder ?? 0),
        options:
          form.type === 'select'
            ? (form.optionsText ?? '').split('\n').map((s) => s.trim()).filter(Boolean)
            : [],
      };
      if (editing) {
        await adminConfigApi.updateCategoryField(editing.id, payload);
      } else {
        await adminConfigApi.createCategoryField(categoryId, { ...payload, key: form.key } as never);
      }
      toast.success(t('wf.saved'));
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (f: CategoryFieldDef) => {
    if (!window.confirm(t('wf.deleteConfirm'))) return;
    try {
      await adminConfigApi.deleteCategoryField(f.id);
      toast.success(t('wf.saved'));
      await load();
    } catch (e) {
      toast.error(errMsg(e, t('wf.saveFailed')));
    }
  };

  const label = (f: CategoryFieldDef) =>
    i18n.language.startsWith('ar') ? f.label : f.labelEn || f.label;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${t('fields.title')} — ${categoryName}`}
      size="lg"
    >
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner />
        </div>
      ) : showForm ? (
        <div className="space-y-3">
          {!editing && (
            <Input
              label={t('fields.key')}
              value={form.key ?? ''}
              onChange={(e) =>
                setForm((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))
              }
              placeholder="contract_number"
              className="font-mono"
            />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label={t('wf.labelAr')} value={form.label ?? ''} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
            <Input label={t('wf.labelEn')} value={form.labelEn ?? ''} onChange={(e) => setForm((p) => ({ ...p, labelEn: e.target.value }))} />
            <Select
              label={t('fields.type')}
              options={FIELD_TYPES.map((ft) => ({ value: ft, label: t(`fields.${ft}`) }))}
              value={form.type ?? 'text'}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CategoryFieldDef['type'] }))}
            />
            <Input label={t('wf.sortOrder')} type="number" value={String(form.sortOrder ?? 0)} onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))} />
          </div>
          {form.type === 'select' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('fields.options')}
              </label>
              <textarea
                value={form.optionsText ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, optionsText: e.target.value }))}
                rows={4}
                className="block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm focus:border-twn-500 focus:outline-none focus:ring-4 focus:ring-twn-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(form.required)}
              onChange={(e) => setForm((p) => ({ ...p, required: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-twn-600 focus:ring-twn-500"
            />
            {t('fields.required')}
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('cancel')}
            </Button>
            <Button loading={submitting} onClick={() => void save()}>
              {t('cfg.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            {t('fields.add')}
          </Button>
          {fields.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">{t('fields.none')}</p>
          ) : (
            <div className="space-y-2">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label(f)}</span>
                  <Badge variant="default">{t(`fields.${f.type}`)}</Badge>
                  {f.required && <Badge variant="warning">{t('fields.required')}</Badge>}
                  {f.isActive === false && <Badge variant="neutral">{t('wf.inactive')}</Badge>}
                  <code className="text-xs text-gray-400">{f.key}</code>
                  {typeof f.valueCount === 'number' && f.valueCount > 0 && (
                    <span className="text-xs text-gray-400">
                      {f.valueCount} {t('fields.values')}
                    </span>
                  )}
                  <div className="ms-auto flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openForm(f)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(f)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
