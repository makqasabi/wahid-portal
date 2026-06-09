import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, Save } from 'lucide-react';
import { ticketsApi, referenceApi } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Combobox } from '@/components/ui/Combobox';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { isMeenaEntity, localName, userName } from '@/lib/utils';
import type { User, Client, Category, Team, Priority, Ticket } from '@/types';

interface FormData {
  actionItem: string;
  categoryId: string;
  clientId: string;
  ownerId: string;
  ownerTeamId: string;
  ownerEntityId: string;
  supportId: string;
  submittingTeamId: string;
  dueDate: string;
  priority: Priority | '';
}

// Priority options are built inside the component to access t()


export default function TicketCreatePage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasMinRole } = useAuth();
  const isEdit = !!id;

  const PRIORITY_OPTIONS: SelectOption[] = [
    { value: 'CRITICAL', label: t('critical') },
    { value: 'HIGH', label: t('high') },
    { value: 'MEDIUM', label: t('medium') },
    { value: 'LOW', label: t('low') },
  ];

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reference data
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [form, setForm] = useState<FormData>({
    actionItem: '',
    categoryId: '',
    clientId: '',
    ownerId: '',
    ownerTeamId: '',
    ownerEntityId: '',
    supportId: '',
    submittingTeamId: user?.teamId ?? '',
    dueDate: '',
    priority: 'MEDIUM',
  });

  // Fetch reference data on mount
  useEffect(() => {
    Promise.all([
      referenceApi.getClients(),
      referenceApi.getCategories(),
      referenceApi.getTeams(),
      referenceApi.getUsers(),
    ]).then(([clientsData, categoriesData, teamsData, usersData]) => {
      setClients(clientsData.filter((c) => c.isActive));
      setCategories(categoriesData.filter((c) => c.isActive));
      setTeams(teamsData);
      setUsers(usersData);
    }).catch(() => {
      toast.error(t('failedLoadFormData'));
    });
  }, []);

  // Fetch existing ticket for edit mode
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    ticketsApi
      .getById(id)
      .then((ticket: Ticket) => {
        // Permission check: only owner, submitter, or admin can edit
        const canEditTicket =
          user?.id === ticket.ownerId ||
          user?.id === ticket.submittedById ||
          hasMinRole('ENTITY_ADMIN');
        if (!canEditTicket) {
          toast.error(t('noPermissionEdit'));
          navigate(`/tickets/${id}`);
          return;
        }
        setForm({
          actionItem: ticket.actionItem,
          categoryId: ticket.categoryId,
          clientId: ticket.clientId,
          ownerId: ticket.ownerId,
          ownerTeamId: ticket.ownerTeamId,
          ownerEntityId: ticket.ownerEntityId,
          supportId: ticket.supportId ?? '',
          submittingTeamId: ticket.submittingTeamId,
          dueDate: ticket.dueDate ? ticket.dueDate.split('T')[0] : '',
          priority: ticket.priority,
        });
      })
      .catch(() => {
        toast.error(t('failedLoadTicket'));
        navigate('/tickets');
      })
      .finally(() => setLoading(false));
  }, [id, navigate, user, hasMinRole]);

  // Auto-fill submitting team from logged-in user (handles async auth load)
  useEffect(() => {
    if (user?.teamId && !form.submittingTeamId && !isEdit) {
      setForm((prev) => ({ ...prev, submittingTeamId: user.teamId }));
    }
  }, [user, isEdit]);

  // Auto-fill owner team and entity when owner changes
  useEffect(() => {
    if (!form.ownerId) return;
    const ownerUser = users.find((u) => u.id === form.ownerId);
    if (ownerUser) {
      setForm((prev) => ({
        ...prev,
        ownerTeamId: ownerUser.teamId,
        ownerEntityId: ownerUser.entityId,
      }));
    }
  }, [form.ownerId, users]);

  const handleChange = (key: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.actionItem.trim()) newErrors.actionItem = t('actionItemRequired');
    if (!form.categoryId) newErrors.categoryId = t('categoryRequired');
    if (!form.clientId) newErrors.clientId = t('clientRequired');
    if (!form.ownerId) newErrors.ownerId = t('ownerRequired');
    if (!form.ownerTeamId) newErrors.ownerTeamId = t('ownerTeamRequired');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Partial<Ticket> = {
        actionItem: form.actionItem,
        categoryId: form.categoryId,
        clientId: form.clientId,
        ownerId: form.ownerId,
        ownerTeamId: form.ownerTeamId,
        ownerEntityId: form.ownerEntityId,
        submittingTeamId: form.submittingTeamId,
        priority: form.priority as Priority,
      };
      if (form.dueDate) payload.dueDate = form.dueDate;
      if (form.supportId) payload.supportId = form.supportId;

      if (isEdit) {
        await ticketsApi.update(id!, payload);
        toast.success(t('ticketUpdated'));
        navigate(`/tickets/${id}`);
      } else {
        const created = await ticketsApi.create(payload);
        toast.success(t('ticketCreated'));
        navigate(`/tickets/${created.id}`);
      }
    } catch {
      toast.error(isEdit ? t('failedUpdateTicket') : t('failedCreateTicket'));
    } finally {
      setSubmitting(false);
    }
  };

  // Derived options
  const clientOptions: SelectOption[] = clients.map((c) => ({
    value: c.id,
    label: localName(c, i18n.language),
  }));

  const categoryOptions: SelectOption[] = categories.map((c) => ({
    value: c.id,
    label: localName(c, i18n.language),
  }));

  const teamOptions: SelectOption[] = teams.map((t) => ({
    value: t.id,
    label: `${localName(t, i18n.language)}${t.entity ? ` (${localName(t.entity, i18n.language)})` : ''}`,
  }));

  const userOptions: SelectOption[] = users.map((u) => ({
    value: u.id,
    label: `${userName(u, i18n.language)}${u.team ? ` - ${localName(u.team, i18n.language)}` : ''}`,
  }));

  // Get the entity for the owner entity badge
  const ownerEntity = (() => {
    if (!form.ownerId) return null;
    const ownerUser = users.find((u) => u.id === form.ownerId);
    if (ownerUser?.entity) return ownerUser.entity;
    // Fallback: look up from team
    const ownerTeam = teams.find((t) => t.id === form.ownerTeamId);
    return ownerTeam?.entity ?? null;
  })();
  const ownerEntityName = ownerEntity?.name ?? '';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 me-1" />
          {t('back')}
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
          {isEdit ? t('editTicket') : t('createTicket')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card title={t('actionItemLabel')}>
          {/* Action Item */}
          <div data-tour="create-action-item">
            <textarea
              id="actionItem"
              value={form.actionItem}
              onChange={(e) => handleChange('actionItem', e.target.value)}
              rows={4}
              placeholder={t('describeActionItem')}
              className={`block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:outline-none focus:ring-4 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 ${
                errors.actionItem
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                  : 'border-gray-300 hover:border-gray-400 focus:border-twn-500 focus:ring-twn-500/15 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            />
            {errors.actionItem && (
              <p className="mt-1 text-xs text-rose-600">{errors.actionItem}</p>
            )}
          </div>

          {/* Submitted By — always the logged-in user, read-only */}
          {!isEdit && (
            <div className="mb-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('submittedBy')}
              </label>
              <div className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 sm:flex-row sm:items-center dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <span className="font-medium">{user?.fullName}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{localName(user?.entity, i18n.language)}</Badge>
                  <Badge variant="default">{localName(user?.team, i18n.language)}</Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {t('ticketsSubmittedUnderYourAccount')}
              </p>
            </div>
          )}
        </Card>

        <Card title={t('details')}>
          <div data-tour="create-assignments" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category */}
            <Combobox
              label={t('categoryLabel')}
              placeholder={t('selectCategory')}
              options={categoryOptions}
              value={form.categoryId}
              onChange={(v) => handleChange('categoryId', v)}
              error={errors.categoryId}
            />

            {/* Client */}
            <Combobox
              label={t('clientLabel')}
              placeholder={t('selectClient')}
              options={clientOptions}
              value={form.clientId}
              onChange={(v) => handleChange('clientId', v)}
              error={errors.clientId}
            />

            {/* Owner */}
            <Combobox
              label={t('ownerLabel')}
              placeholder={t('selectOwner')}
              options={userOptions}
              value={form.ownerId}
              onChange={(v) => handleChange('ownerId', v)}
              error={errors.ownerId}
            />

            {/* Owner Team */}
            <Combobox
              label={t('ownerTeamLabel')}
              placeholder={t('selectTeam')}
              options={teamOptions}
              value={form.ownerTeamId}
              onChange={(v) => handleChange('ownerTeamId', v)}
              error={errors.ownerTeamId}
            />

            {/* Owner Entity (read-only badge) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('ownerEntity')}
              </label>
              {ownerEntityName ? (
                <Badge
                  variant={
                    isMeenaEntity(ownerEntityName)
                      ? 'warning'
                      : 'info'
                  }
                >
                  {localName(ownerEntity, i18n.language)}
                </Badge>
              ) : (
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  {t('autoDerivedFromOwnerTeam')}
                </span>
              )}
            </div>

            {/* Support */}
            <Combobox
              label={t('supportOptional')}
              placeholder={t('selectSupport')}
              options={[{ value: '', label: t('none') }, ...userOptions]}
              value={form.supportId}
              onChange={(v) => handleChange('supportId', v)}
            />

            {/* Submitting Team */}
            <Combobox
              label={t('submittingTeam')}
              placeholder={t('selectTeam')}
              options={teamOptions}
              value={form.submittingTeamId}
              onChange={(v) => handleChange('submittingTeamId', v)}
              disabled={!hasMinRole('TEAM_LEAD')}
            />

            {/* Due Date */}
            <Input
              label={t('dueDate')}
              type="date"
              value={form.dueDate}
              onChange={(e) => handleChange('dueDate', e.target.value)}
            />

            {/* Priority */}
            <Select
              label={t('priority')}
              placeholder={t('selectPriority')}
              options={PRIORITY_OPTIONS}
              value={form.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
            />
          </div>

        </Card>

        {/* Submit */}
        <div data-tour="create-submit" className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <Button
              variant="outline"
              type="button"
              onClick={() => navigate(-1)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              loading={submitting}
              icon={<Save className="h-4 w-4" />}
            >
              {isEdit ? t('updateTicket') : t('createTicket')}
            </Button>
          </div>
        </form>
    </div>
  );
}
