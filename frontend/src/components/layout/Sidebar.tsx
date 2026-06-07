import { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  LayoutDashboard,
  Ticket,
  ShieldCheck,
  LogOut,
  KeyRound,
  Menu,
  X,
  Layers,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, isMeenaEntity, localName } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ReactNode;
  minRole?: 'ENTITY_ADMIN';
}

const navItems: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/tickets', labelKey: 'nav.tickets', icon: <Ticket className="h-5 w-5" /> },
  {
    to: '/admin',
    labelKey: 'nav.admin',
    icon: <ShieldCheck className="h-5 w-5" />,
    minRole: 'ENTITY_ADMIN',
  },
];

export function Sidebar() {
  const { t, i18n } = useTranslation();
  const { user, logout, hasMinRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const isMeena = isMeenaEntity(user?.entity?.name);

  // Change password state
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  // 2FA setup state
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaStep, setMfaStep] = useState<'init' | 'verify'>('init');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaUrl, setMfaUrl] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const handleChangePassword = async () => {
    if (!oldPw || !newPw) { toast.error(t('sidebar.fillBothFields')); return; }
    setPwLoading(true);
    try {
      await authApi.changePassword(oldPw, newPw);
      toast.success(t('sidebar.passwordChanged'));
      setPwOpen(false);
      setOldPw('');
      setNewPw('');
      logout();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('sidebar.failedChangePassword');
      toast.error(msg);
    } finally {
      setPwLoading(false);
    }
  };

  const handleSetup2FA = async () => {
    setMfaLoading(true);
    try {
      const data = await authApi.setup2FA();
      setMfaSecret(data.secret);
      setMfaUrl(data.otpauthUrl);
      setMfaStep('verify');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('sidebar.failedSetup2FA');
      toast.error(msg);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!mfaCode || mfaCode.length !== 6) { toast.error(t('sidebar.enter6DigitError')); return; }
    setMfaLoading(true);
    try {
      await authApi.verify2FA(mfaCode);
      toast.success(t('sidebar.twoFactorEnabled'));
      setMfaOpen(false);
      setMfaStep('init');
      setMfaCode('');
      setMfaSecret('');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('sidebar.invalidCode');
      toast.error(msg);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    const pw = prompt(t('sidebar.disablePrompt'));
    if (!pw) return;
    try {
      await authApi.disable2FA(pw);
      toast.success(t('sidebar.twoFactorDisabled'));
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? t('sidebar.failedDisable2FA'));
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div data-tour="logo" className={cn('flex items-center border-b border-gray-200 py-5 transition-all duration-200 dark:border-gray-700', collapsed ? 'justify-center px-2' : 'gap-3 px-5')}>
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isMeena ? 'bg-meena-600' : 'bg-twn-600',
          )}
        >
          <Layers className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">واحد</span>
            <span className="text-[10px] text-gray-400 tracking-wider dark:text-gray-500">WAHID</span>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav data-tour="nav" className={cn('flex-1 space-y-1 py-4 transition-all duration-200', collapsed ? 'px-2' : 'px-3')}>
        {navItems
          .filter((item) => !item.minRole || hasMinRole(item.minRole))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? t(item.labelKey) : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3',
                  isActive
                    ? cn(
                        'text-white',
                        isMeena ? 'bg-meena-600' : 'bg-twn-600',
                      )
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && t(item.labelKey)}
              {collapsed && (
                <span className="pointer-events-none absolute end-full me-2 z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  {t(item.labelKey)}
                </span>
              )}
            </NavLink>
          ))}
      </nav>

      {/* User info */}
      <div data-tour="user-section" className={cn('border-t border-gray-200 py-4 transition-all duration-200 dark:border-gray-700', collapsed ? 'px-2' : 'px-4')}>
        {collapsed ? (
          /* Collapsed: avatar only */
          <div className="mb-2 flex justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300" title={user?.fullName}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
          </div>
        ) : (
          /* Expanded: full user info */
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
              {user?.fullName}
            </p>
            <p className="text-xs text-gray-500 truncate dark:text-gray-400">{user?.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge variant="info">{t(`admin.roles.${({SUPER_ADMIN:'superAdmin',ENTITY_ADMIN:'entityAdmin',TEAM_LEAD:'teamLead',MEMBER:'member',OBSERVER:'observer',EXTERNAL_STAKEHOLDER:'externalStakeholder'} as Record<string,string>)[user?.role ?? ''] ?? 'member'}`)}</Badge>
              <Badge variant={isMeena ? 'warning' : 'default'}>
                {localName(user?.entity, i18n.language)}
              </Badge>
            </div>
          </div>
        )}
        <button
          onClick={() => setPwOpen(true)}
          title={collapsed ? t('sidebar.changePassword') : undefined}
          className={cn(
            'group relative flex w-full items-center rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          )}
        >
          <KeyRound className="h-4 w-4 shrink-0" />
          {!collapsed && t('sidebar.changePassword')}
          {collapsed && (
            <span className="pointer-events-none absolute end-full me-2 z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {t('sidebar.changePassword')}
            </span>
          )}
        </button>
        <button
          onClick={() => { setMfaOpen(true); setMfaStep('init'); setMfaCode(''); }}
          title={collapsed ? t('sidebar.twoFactorAuth') : undefined}
          className={cn(
            'group relative flex w-full items-center rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          )}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {!collapsed && t('sidebar.twoFactorAuth')}
          {collapsed && (
            <span className="pointer-events-none absolute end-full me-2 z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {t('sidebar.twoFactorAuth')}
            </span>
          )}
        </button>
        <button
          onClick={() => logout()}
          title={collapsed ? t('nav.logout') : undefined}
          className={cn(
            'group relative flex w-full items-center rounded-lg py-2 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-gray-400 dark:hover:bg-red-900/30',
            collapsed ? 'justify-center px-2' : 'gap-2 px-3',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && t('nav.logout')}
          {collapsed && (
            <span className="pointer-events-none absolute end-full me-2 z-50 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {t('nav.logout')}
            </span>
          )}
        </button>
      </div>

      {/* Collapse toggle */}
      <div className="hidden border-t border-gray-200 lg:block dark:border-gray-700">
        <button
          onClick={toggleCollapsed}
          className="flex w-full items-center justify-center py-3 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger (visible only on small screens, positioned by Header) */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed start-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden dark:bg-gray-800 dark:text-gray-100"
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 border-e border-gray-200 bg-white transition-all duration-200 lg:static lg:!translate-x-0 dark:border-gray-700 dark:bg-gray-900',
          collapsed ? 'w-16' : 'w-[250px]',
          mobileOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Change Password Modal */}
      <Modal
        open={pwOpen}
        onOpenChange={(open) => {
          setPwOpen(open);
          if (!open) { setOldPw(''); setNewPw(''); }
        }}
        title={t('sidebar.changePasswordTitle')}
      >
        <div className="space-y-4">
          <div className="relative">
            <Input
              label={t('sidebar.currentPassword')}
              type={showOld ? 'text' : 'password'}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowOld(!showOld)}
              className="absolute end-3 top-[34px] text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Input
              label={t('sidebar.newPassword')}
              type={showNew ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute end-3 top-[34px] text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('sidebar.passwordRequirements')}
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={pwLoading} onClick={handleChangePassword}>
              {t('sidebar.changePasswordBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2FA Setup Modal */}
      <Modal
        open={mfaOpen}
        onOpenChange={(open) => {
          setMfaOpen(open);
          if (!open) { setMfaStep('init'); setMfaCode(''); setMfaSecret(''); }
        }}
        title={t('sidebar.twoFactorTitle')}
        size="lg"
      >
        {mfaStep === 'init' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('sidebar.twoFactorDescription')}
            </p>
            <div className="flex gap-3">
              <Button onClick={handleSetup2FA} loading={mfaLoading}>
                {t('sidebar.setup2FA')}
              </Button>
              <Button variant="outline" onClick={handleDisable2FA}>
                {t('sidebar.disable2FA')}
              </Button>
            </div>
          </div>
        )}

        {mfaStep === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('sidebar.scanQR')}
            </p>

            {/* QR Code - rendered as a URL the user can open */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mfaUrl)}`}
                alt="2FA QR Code"
                className="mx-auto h-48 w-48"
              />
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">{t('sidebar.manualEntryKey')}</p>
              <code className="block rounded bg-gray-100 px-3 py-2 text-sm font-mono text-gray-800 select-all break-all dark:bg-gray-700 dark:text-gray-200">
                {mfaSecret}
              </code>
            </div>

            <Input
              label={t('sidebar.enter6Digit')}
              type="text"
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              autoComplete="one-time-code"
            />

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setMfaOpen(false)}>
                {t('cancel')}
              </Button>
              <Button loading={mfaLoading} onClick={handleVerify2FA}>
                {t('sidebar.verifyEnable')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
