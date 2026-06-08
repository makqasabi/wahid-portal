import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/client';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { GuidedTour, useGuidedTour } from '@/components/ui/GuidedTour';
import { CommandPalette } from '@/components/CommandPalette';

export function AppLayout() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  // Forced password change state
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  // Force password change screen
  if (user?.mustChangePassword) {
    const handleForceChange = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!oldPw || !newPw) return;
      setChanging(true);
      try {
        await authApi.changePassword(oldPw, newPw);
        toast.success(t('forcePassword.success'));
        logout();
      } catch (err: any) {
        toast.error(err?.response?.data?.error ?? t('forcePassword.failed'));
      } finally {
        setChanging(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
        <div className="w-full max-w-md">
          <Card>
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                <Lock className="h-6 w-6 text-yellow-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{t('forcePassword.title')}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('forcePassword.subtitle')}
              </p>
            </div>
            <form onSubmit={handleForceChange} className="space-y-4">
              <Input
                label={t('forcePassword.currentPassword')}
                type="password"
                value={oldPw}
                onChange={(e) => setOldPw(e.target.value)}
                required
                autoComplete="current-password"
              />
              <div className="relative">
                <Input
                  label={t('forcePassword.newPassword')}
                  type={showPw ? 'text' : 'password'}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute end-3 top-[34px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('forcePassword.requirements')}
              </p>
              <Button type="submit" className="w-full" loading={changing}>
                {t('forcePassword.submit')}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  const { isTourOpen, openTour, closeTour } = useGuidedTour();

  return (
    <div className="theme-transition flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenTour={openTour} />
        <main data-tour="main-content" className="flex-1 overflow-y-auto scroll-smooth">
          <div className="mx-auto w-full max-w-[1600px] animate-fade-in p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <GuidedTour open={isTourOpen} onClose={closeTour} navigate={navigate} />
      <CommandPalette />
    </div>
  );
}
