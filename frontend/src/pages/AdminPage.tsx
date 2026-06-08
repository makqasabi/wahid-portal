import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Users,
  Building2,
  Tag,
  ScrollText,
  Plus,
  Edit2,
  UserMinus,
} from 'lucide-react';
import { adminApi, usersApi } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { cn, formatDateTime, localName } from '@/lib/utils';
import type { User, Client, Category, AuditLog, Team, Entity, Role } from '@/types';

type AdminTab = 'users' | 'clients' | 'categories' | 'entities' | 'audit';

const ROLE_KEYS: Record<string, string> = {
  SUPER_ADMIN: 'admin.roles.superAdmin',
  ENTITY_ADMIN: 'admin.roles.entityAdmin',
  TEAM_LEAD: 'admin.roles.teamLead',
  MEMBER: 'admin.roles.member',
  OBSERVER: 'admin.roles.observer',
  EXTERNAL_STAKEHOLDER: 'admin.roles.externalStakeholder',
};

function useRoleOptions(): SelectOption[] {
  const { t } = useTranslation();
  return Object.entries(ROLE_KEYS).map(([value, key]) => ({
    value,
    label: t(key),
  }));
}

export default function AdminPage() {
  const { t } = useTranslation();
  const { isEntityAdmin, isSuperAdmin, user: currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Guard: only admins
  if (!isEntityAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'users', label: t('admin.tabs.users'), icon: <Users className="h-4 w-4" /> },
    { key: 'clients', label: t('admin.tabs.clients'), icon: <Building2 className="h-4 w-4" /> },
    { key: 'categories', label: t('admin.tabs.categories'), icon: <Tag className="h-4 w-4" /> },
    ...(isSuperAdmin ? [{ key: 'entities' as const, label: t('admin.tabs.entities'), icon: <Building2 className="h-4 w-4" /> }] : []),
    { key: 'audit', label: t('admin.tabs.audit'), icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        {t('admin.title') ?? 'Administration'}
      </h1>

      {/* Tabs */}
      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'users' && (
        <UsersTab
          isSuperAdmin={!!isSuperAdmin}
          currentUserEntityId={currentUser?.entityId}
        />
      )}
      {activeTab === 'clients' && <ClientsTab isSuperAdmin={!!isSuperAdmin} />}
      {activeTab === 'categories' && <CategoriesTab isSuperAdmin={!!isSuperAdmin} />}
      {activeTab === 'entities' && <EntitiesTab />}
      {activeTab === 'audit' && <AuditLogTab />}
    </div>
  );
}

/* ============================= Users Tab ============================= */

function UsersTab({
  isSuperAdmin,
  currentUserEntityId,
}: {
  isSuperAdmin: boolean;
  currentUserEntityId?: string;
}) {
  const { t, i18n } = useTranslation();
  const ROLE_OPTIONS = useRoleOptions();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'MEMBER' as Role,
    entityId: '',
    teamId: '',
  });
  const [inviting, setInviting] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);

  // Delete-with-transfer modal state
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deletePending, setDeletePending] = useState<{ ownedPending: number; supportPending: number } | null>(null);
  const [deleteTransferToId, setDeleteTransferToId] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list(search || undefined);
      let data = res.data;
      // Entity admin: filter to own entity
      if (!isSuperAdmin && currentUserEntityId) {
        data = data.filter((u) => u.entityId === currentUserEntityId);
      }
      setUsers(data);
    } catch {
      toast.error(t('admin.failedLoadUsers'));
    } finally {
      setLoading(false);
    }
  }, [search, isSuperAdmin, currentUserEntityId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    Promise.all([adminApi.getTeams(), adminApi.getEntities()])
      .then(([t, e]) => {
        setTeams(t);
        setEntities(e);
      })
      .catch(() => {});
  }, []);

  // Auto-fill entity for entity admin
  useEffect(() => {
    if (!isSuperAdmin && currentUserEntityId && !inviteForm.entityId) {
      setInviteForm((f) => ({ ...f, entityId: currentUserEntityId }));
    }
  }, [isSuperAdmin, currentUserEntityId, inviteForm.entityId]);

  const handleInvite = async () => {
    if (!inviteForm.fullName || !inviteForm.email || !inviteForm.password) {
      toast.error(t('admin.fillRequired'));
      return;
    }
    setInviting(true);
    try {
      await usersApi.invite({
        fullName: inviteForm.fullName,
        email: inviteForm.email,
        password: inviteForm.password,
        role: inviteForm.role,
        entityId: inviteForm.entityId,
        teamId: inviteForm.teamId,
      });
      toast.success(t('admin.userInvited'));
      setInviteOpen(false);
      setInviteForm({ fullName: '', email: '', password: '', role: 'MEMBER', entityId: '', teamId: '' });
      await fetchUsers();
    } catch {
      toast.error(t('admin.failedInvite'));
    } finally {
      setInviting(false);
    }
  };

  const openDeleteModal = async (u: User) => {
    setDeleteTarget(u);
    setDeleteTransferToId('');
    setDeletePending(null);
    try {
      const counts = await usersApi.pendingCount(u.id);
      setDeletePending(counts);
    } catch {
      setDeletePending({ ownedPending: 0, supportPending: 0 });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if ((deletePending?.ownedPending ?? 0) > 0 && !deleteTransferToId) {
      toast.error(t('admin.transfereeRequired'));
      return;
    }
    setDeleting(true);
    try {
      await usersApi.deactivate(deleteTarget.id, deleteTransferToId || undefined);
      toast.success(t('admin.userDeactivated', { name: deleteTarget.fullName }));
      setDeleteTarget(null);
      await fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('admin.failedDeactivate');
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;
    try {
      await usersApi.update(editUser.id, {
        role: editUser.role,
        teamId: editUser.teamId,
      });
      toast.success(t('admin.userUpdated'));
      setEditUser(null);
      await fetchUsers();
    } catch {
      toast.error(t('admin.failedUpdateUser'));
    }
  };

  // Entity admin can only invite to their own entity
  const entityOptions: SelectOption[] = isSuperAdmin
    ? entities.map((e) => ({ value: e.id, label: localName(e, i18n.language) }))
    : entities
        .filter((e) => e.id === currentUserEntityId)
        .map((e) => ({ value: e.id, label: localName(e, i18n.language) }));

  // Filter teams to match selected invite entity
  const filteredTeamOptions: SelectOption[] = teams
    .filter((t) => !inviteForm.entityId || t.entity?.id === inviteForm.entityId)
    .map((t) => ({
      value: t.id,
      label: `${localName(t, i18n.language)}${t.entity ? ` (${localName(t.entity, i18n.language)})` : ''}`,
    }));

  const teamOptions: SelectOption[] = teams.map((t) => ({
    value: t.id,
    label: `${localName(t, i18n.language)}${t.entity ? ` (${localName(t.entity, i18n.language)})` : ''}`,
  }));

  // Entity admin cannot assign roles >= their own level
  const allowedRoleOptions: SelectOption[] = isSuperAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(
        (r) => !['SUPER_ADMIN', 'ENTITY_ADMIN'].includes(r.value),
      );

  const columns: Column<User>[] = [
    { key: 'fullName', header: t('admin.columns.name'), sortable: true },
    { key: 'email', header: t('admin.columns.email') },
    {
      key: 'entity',
      header: t('admin.columns.entity'),
      render: (row: User) => localName(row.entity, i18n.language),
    },
    {
      key: 'team',
      header: t('admin.columns.team'),
      render: (row: User) => localName(row.team, i18n.language),
    },
    {
      key: 'role',
      header: t('admin.columns.role'),
      render: (row: User) => (
        <Badge variant="default">{t(ROLE_KEYS[row.role] ?? row.role)}</Badge>
      ),
    },
    {
      key: 'isActive',
      header: t('admin.columns.status'),
      render: (row: User) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: User) => {
        // Entity admin cannot edit/deactivate super admins
        const canManage = isSuperAdmin || row.role !== 'SUPER_ADMIN';
        if (!canManage) return null;
        return (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditUser(row)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            {row.isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openDeleteModal(row)}
              >
                <UserMinus className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card
      title={t('admin.tabs.users')}
      actions={
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
          {t('admin.inviteUser')}
        </Button>
      }
    >
      <div className="mb-4 max-w-xs">
        <Input
          placeholder={t('admin.searchUsers')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={users as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage={t('admin.noUsersFound')}
      />

      {/* Invite Modal */}
      <Modal open={inviteOpen} onOpenChange={setInviteOpen} title={t('admin.inviteUser')} size="lg">
        <div className="space-y-4">
          <Input
            label={t('admin.fullNameRequired')}
            value={inviteForm.fullName}
            onChange={(e) => setInviteForm((f) => ({ ...f, fullName: e.target.value }))}
          />
          <Input
            label={t('admin.emailRequired')}
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
          />
          <Input
            label={t('admin.passwordRequired')}
            type="password"
            value={inviteForm.password}
            onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t('role')}
              options={allowedRoleOptions}
              value={inviteForm.role}
              onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value as Role }))}
            />
            <Select
              label={t('entity')}
              placeholder={t('admin.selectEntity')}
              options={entityOptions}
              value={inviteForm.entityId}
              onChange={(e) => setInviteForm((f) => ({ ...f, entityId: e.target.value, teamId: '' }))}
              disabled={!isSuperAdmin}
            />
            <Select
              label={t('team')}
              placeholder={t('admin.selectTeam')}
              options={filteredTeamOptions}
              value={inviteForm.teamId}
              onChange={(e) => setInviteForm((f) => ({ ...f, teamId: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={inviting} onClick={handleInvite}>
              {t('admin.sendInvite')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        open={!!editUser}
        onOpenChange={(open) => { if (!open) setEditUser(null); }}
        title={t('admin.editUser', { name: editUser?.fullName ?? '' })}
      >
        {editUser && (
          <div className="space-y-4">
            <Select
              label={t('role')}
              options={allowedRoleOptions}
              value={editUser.role}
              onChange={(e) =>
                setEditUser((prev) =>
                  prev ? { ...prev, role: e.target.value as Role } : null,
                )
              }
            />
            <Select
              label={t('team')}
              placeholder={t('admin.selectTeam')}
              options={teamOptions}
              value={editUser.teamId}
              onChange={(e) =>
                setEditUser((prev) =>
                  prev ? { ...prev, teamId: e.target.value } : null,
                )
              }
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditUser(null)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleUpdateUser}>{t('admin.saveChanges')}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete User Modal (with ticket transfer) */}
      <Modal
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleting) { setDeleteTarget(null); setDeleteTransferToId(''); setDeletePending(null); } }}
        title={t('admin.deleteUserTitle', { name: deleteTarget?.fullName ?? '' })}
      >
        {deleteTarget && (
          <div className="space-y-4">
            {deletePending === null ? (
              <div className="text-sm text-gray-500">{t('admin.checkingPending')}</div>
            ) : (
              <>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {t('admin.deleteUserSummary', {
                    owned: deletePending.ownedPending,
                    support: deletePending.supportPending,
                  })}
                </div>
                {deletePending.ownedPending > 0 && (
                  <Select
                    label={t('admin.transferOwnedTo')}
                    placeholder={t('admin.selectTransferee')}
                    options={users
                      .filter((u) => u.id !== deleteTarget.id && u.isActive && u.entityId === deleteTarget.entityId)
                      .map((u) => ({ value: u.id, label: `${u.fullName} (${u.email})` }))}
                    value={deleteTransferToId}
                    onChange={(e) => setDeleteTransferToId(e.target.value)}
                  />
                )}
                {deletePending.supportPending > 0 && (
                  <div className="text-xs text-gray-500">
                    {t('admin.supportClearedNote', { count: deletePending.supportPending })}
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteTransferToId(''); setDeletePending(null); }} disabled={deleting}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                loading={deleting}
                disabled={deletePending === null}
                onClick={handleConfirmDelete}
              >
                {t('delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ============================= Clients Tab ============================= */

function ClientsTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t, i18n } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [editName, setEditName] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getClients();
      setClients(data);
    } catch {
      toast.error(t('admin.failedLoadClients'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const parseAliases = (aliases: unknown): string[] => {
    if (Array.isArray(aliases)) return aliases;
    if (typeof aliases === 'string') {
      try { const parsed = JSON.parse(aliases); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(t('admin.deleteConfirm', { name: client.name }))) return;
    try {
      const res = await adminApi.deleteClient(client.id);
      toast.success(res.message ?? t('admin.clientRemoved'));
      await fetchClients();
    } catch {
      toast.error(t('admin.failedDeleteClient'));
    }
  };

  const handleUpdate = async () => {
    if (!editClient || !editName.trim()) return;
    setSaving(true);
    try {
      await adminApi.updateClient(editClient.id, { name: editName.trim() });
      toast.success(t('admin.clientUpdated'));
      setEditClient(null);
      await fetchClients();
    } catch {
      toast.error(t('admin.failedUpdateClient'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (client: Client) => {
    try {
      await adminApi.updateClient(client.id, { isActive: !client.isActive });
      toast.success(client.isActive ? t('admin.clientDeactivated') : t('admin.clientActivated'));
      await fetchClients();
    } catch {
      toast.error(t('admin.failedUpdateClient'));
    }
  };

  const columns: Column<Client>[] = [
    { key: 'name', header: t('admin.columns.name'), sortable: true, render: (row: Client) => localName(row, i18n.language) },
    {
      key: 'aliases',
      header: t('admin.columns.aliases'),
      render: (row: Client) => {
        const arr = parseAliases(row.aliases);
        return arr.length ? arr.join(', ') : '-';
      },
    },
    {
      key: 'isActive',
      header: t('admin.columns.status'),
      render: (row: Client) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            key: 'actions' as keyof Client,
            header: '',
            render: (row: Client) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditClient(row); setEditName(row.name); }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(row)}>
                  <Badge variant={row.isActive ? 'neutral' : 'success'} className="text-xs cursor-pointer">
                    {row.isActive ? t('admin.deactivate') : t('admin.activate')}
                  </Badge>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(row)}>
                  <UserMinus className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title={t('admin.tabs.clients')}
      actions={
        isSuperAdmin ? (
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setAddOpen(true)}
          >
            {t('admin.addClient')}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        data={clients as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage={t('admin.noClientsFound')}
      />

      {/* Add Modal */}
      <Modal open={addOpen} onOpenChange={setAddOpen} title={t('admin.addClient')}>
        <div className="space-y-4">
          <Input
            label={t('admin.clientName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              loading={saving}
              onClick={async () => {
                if (!newName.trim()) return;
                setSaving(true);
                try {
                  await adminApi.createClient(newName.trim());
                  toast.success(t('admin.clientAdded'));
                  setAddOpen(false);
                  setNewName('');
                  await fetchClients();
                } catch {
                  toast.error(t('admin.failedAddClient'));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t('admin.add')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editClient} onOpenChange={(open) => { if (!open) setEditClient(null); }} title={t('admin.editClient', { name: editClient?.name ?? '' })}>
        <div className="space-y-4">
          <Input
            label={t('admin.clientName')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditClient(null)}>
              {t('cancel')}
            </Button>
            <Button loading={saving} onClick={handleUpdate}>
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/* ============================= Categories Tab ============================= */

function CategoriesTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t, i18n } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCategories();
      setCategories(data);
    } catch {
      toast.error(t('admin.failedLoadCategories'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDelete = async (cat: Category) => {
    if (!confirm(t('admin.deleteConfirm', { name: cat.name }))) return;
    try {
      const res = await adminApi.deleteCategory(cat.id);
      toast.success(res.message ?? t('admin.categoryRemoved'));
      await fetchCategories();
    } catch {
      toast.error(t('admin.failedDeleteCategory'));
    }
  };

  const handleUpdate = async () => {
    if (!editCategory || !editName.trim()) return;
    setSaving(true);
    try {
      await adminApi.updateCategory(editCategory.id, { name: editName.trim() });
      toast.success(t('admin.categoryUpdated'));
      setEditCategory(null);
      await fetchCategories();
    } catch {
      toast.error(t('admin.failedUpdateCategory'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    try {
      await adminApi.updateCategory(cat.id, { isActive: !cat.isActive });
      toast.success(cat.isActive ? t('admin.categoryDeactivated') : t('admin.categoryActivated'));
      await fetchCategories();
    } catch {
      toast.error(t('admin.failedUpdateCategory'));
    }
  };

  const columns: Column<Category>[] = [
    { key: 'name', header: t('admin.columns.name'), sortable: true, render: (row: Category) => localName(row, i18n.language) },
    {
      key: 'isActive',
      header: t('admin.columns.status'),
      render: (row: Category) => (
        <Badge variant={row.isActive ? 'success' : 'neutral'}>
          {row.isActive ? t('active') : t('inactive')}
        </Badge>
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            key: 'actions' as keyof Category,
            header: '',
            render: (row: Category) => (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditCategory(row); setEditName(row.name); }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(row)}>
                  <Badge variant={row.isActive ? 'neutral' : 'success'} className="text-xs cursor-pointer">
                    {row.isActive ? t('admin.deactivate') : t('admin.activate')}
                  </Badge>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(row)}>
                  <UserMinus className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card
      title={t('admin.tabs.categories')}
      actions={
        isSuperAdmin ? (
          <Button
            size="sm"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setAddOpen(true)}
          >
            {t('admin.addCategory')}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        columns={columns}
        data={categories as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage={t('admin.noCategoriesFound')}
      />

      {/* Add Modal */}
      <Modal open={addOpen} onOpenChange={setAddOpen} title={t('admin.addCategory')}>
        <div className="space-y-4">
          <Input
            label={t('admin.categoryName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              loading={saving}
              onClick={async () => {
                if (!newName.trim()) return;
                setSaving(true);
                try {
                  await adminApi.createCategory(newName.trim());
                  toast.success(t('admin.categoryAdded'));
                  setAddOpen(false);
                  setNewName('');
                  await fetchCategories();
                } catch {
                  toast.error(t('admin.failedAddCategory'));
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t('admin.add')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editCategory} onOpenChange={(open) => { if (!open) setEditCategory(null); }} title={t('admin.editCategory', { name: editCategory?.name ?? '' })}>
        <div className="space-y-4">
          <Input
            label={t('admin.categoryName')}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditCategory(null)}>
              {t('cancel')}
            </Button>
            <Button loading={saving} onClick={handleUpdate}>
              {t('save')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/* ============================= Entities Tab ============================= */

function EntitiesTab() {
  const { t, i18n } = useTranslation();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editEntity, setEditEntity] = useState<Entity | null>(null);
  const [editForm, setEditForm] = useState<{ escalationContactId: string; slaWarningDays: string; slaEscalationDays: string }>({ escalationContactId: '', slaWarningDays: '', slaEscalationDays: '' });
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ents, us] = await Promise.all([
        adminApi.getEntities(),
        usersApi.list().then((r) => r.data),
      ]);
      setEntities(ents);
      setUsers(us);
    } catch {
      toast.error(t('admin.failedLoadEntities'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEdit = (e: Entity) => {
    setEditEntity(e);
    setEditForm({
      escalationContactId: e.escalationContactId ?? '',
      slaWarningDays: String(e.slaWarningDays),
      slaEscalationDays: String(e.slaEscalationDays),
    });
  };

  const handleSave = async () => {
    if (!editEntity) return;
    setSaving(true);
    try {
      await adminApi.updateEntity(editEntity.id, {
        escalationContactId: editForm.escalationContactId || null,
        slaWarningDays: Number(editForm.slaWarningDays),
        slaEscalationDays: Number(editForm.slaEscalationDays),
      });
      toast.success(t('admin.entityUpdated'));
      setEditEntity(null);
      await fetchAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? t('admin.failedUpdateEntity'));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Entity>[] = [
    { key: 'name', header: t('admin.columns.name'), render: (row: Entity) => localName(row, i18n.language) },
    {
      key: 'escalationContact',
      header: t('admin.columns.escalationContact'),
      render: (row: Entity) =>
        row.escalationContact ? `${row.escalationContact.fullName} (${row.escalationContact.email})` : <span className="text-gray-400">—</span>,
    },
    { key: 'slaWarningDays', header: t('admin.columns.slaWarningDays') },
    { key: 'slaEscalationDays', header: t('admin.columns.slaEscalationDays') },
    {
      key: 'actions',
      header: '',
      render: (row: Entity) => (
        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  const transfereeOptions: SelectOption[] = editEntity
    ? [
        { value: '', label: t('admin.noEscalationContact') },
        ...users
          .filter((u) => u.isActive && u.entityId === editEntity.id)
          .map((u) => ({ value: u.id, label: `${u.fullName} (${u.email})` })),
      ]
    : [];

  return (
    <Card title={t('admin.tabs.entities')}>
      <DataTable
        columns={columns}
        data={entities as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage={t('admin.noEntities')}
      />

      <Modal
        open={!!editEntity}
        onOpenChange={(open) => { if (!open && !saving) setEditEntity(null); }}
        title={editEntity ? t('admin.editEntity', { name: localName(editEntity, i18n.language) }) : ''}
      >
        {editEntity && (
          <div className="space-y-4">
            <Select
              label={t('admin.escalationContact')}
              options={transfereeOptions}
              value={editForm.escalationContactId}
              onChange={(e) => setEditForm((f) => ({ ...f, escalationContactId: e.target.value }))}
            />
            <p className="text-xs text-gray-500">{t('admin.escalationContactHelp')}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label={t('admin.columns.slaWarningDays')}
                type="number"
                value={editForm.slaWarningDays}
                onChange={(e) => setEditForm((f) => ({ ...f, slaWarningDays: e.target.value }))}
              />
              <Input
                label={t('admin.columns.slaEscalationDays')}
                type="number"
                value={editForm.slaEscalationDays}
                onChange={(e) => setEditForm((f) => ({ ...f, slaEscalationDays: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditEntity(null)} disabled={saving}>{t('cancel')}</Button>
              <Button onClick={handleSave} loading={saving}>{t('admin.saveChanges')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

/* ============================= Audit Log Tab ============================= */

function AuditLogTab() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs({
        page,
        limit,
        ...(search ? { search } : {}),
      });
      setLogs(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch {
      toast.error(t('admin.failedLoadAudit'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'createdAt',
      header: t('admin.audit.timestamp'),
      sortable: true,
      render: (row: AuditLog) => (
        <span className="text-xs">{formatDateTime(row.createdAt)}</span>
      ),
    },
    {
      key: 'user',
      header: t('admin.audit.user'),
      render: (row: AuditLog) => row.user?.fullName ?? '-',
    },
    { key: 'ticketId', header: t('admin.audit.ticket') },
    { key: 'action', header: t('admin.audit.action') },
    { key: 'fieldName', header: t('admin.audit.field') },
    {
      key: 'oldValue',
      header: t('admin.audit.oldValue'),
      render: (row: AuditLog) =>
        row.oldValue ? (
          <span className="text-red-600 line-through text-xs">
            {row.oldValue}
          </span>
        ) : (
          '-'
        ),
    },
    {
      key: 'newValue',
      header: t('admin.audit.newValue'),
      render: (row: AuditLog) =>
        row.newValue ? (
          <span className="text-green-700 text-xs">{row.newValue}</span>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Card title={t('admin.tabs.audit')}>
      <div className="mb-4 max-w-xs">
        <Input
          placeholder={t('admin.searchAudit')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={logs as unknown as Record<string, unknown>[]}
        loading={loading}
        emptyMessage={t('admin.noAuditEntries')}
      />

      {totalPages > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => {
              setLimit(l);
              setPage(1);
            }}
          />
        </div>
      )}
    </Card>
  );
}
