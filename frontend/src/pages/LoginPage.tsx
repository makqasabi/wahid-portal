import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { authApi } from '@/api/client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Eye, EyeOff, Lock, Mail, ArrowLeft, KeyRound, Globe } from 'lucide-react';

type View = 'login' | 'forgot' | 'reset' | '2fa';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t, i18n } = useTranslation();

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset flow state
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 2FA state
  const [totpCode, setTotpCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, totpCode || undefined);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      if (err?.requires2FA || err?.response?.data?.requires2FA) {
        setView('2fa');
        setError('');
        setSuccess(t('login.passwordVerified'));
      } else {
        const data = err?.response?.data;
        let message = data?.error ?? t('login.invalidCredentials');
        if (data?.attemptsRemaining !== undefined) {
          message += t('login.attemptsRemaining', { count: data.attemptsRemaining });
        }
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) {
      setError(t('login.enter6DigitCode'));
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await login(email, password, totpCode);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.error ?? t('login.invalid2faCode');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError(t('login.enterEmail'));
      return;
    }
    setError('');
    setLoading(true);

    try {
      await authApi.forgotPassword(email);
      setSuccess(t('login.resetCodeSent'));
      setView('reset');
    } catch {
      setError(t('login.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || !newPassword) {
      setError(t('login.fillAllFields'));
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await authApi.resetPassword(resetCode, newPassword);
      setSuccess(t('login.passwordResetSuccess'));
      setView('login');
      setPassword('');
      setResetCode('');
      setNewPassword('');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? t('login.invalidResetCode');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const switchView = (v: View) => {
    setView(v);
    setError('');
    setSuccess('');
  };

  const isArabic = i18n.language === 'ar';
  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-twn-600 to-meena-600 px-4">
      {/* Language toggle */}
      <button
        onClick={toggleLanguage}
        className="fixed top-4 end-4 z-50 inline-flex items-center gap-1.5 rounded-lg bg-white/15 backdrop-blur-sm px-3 py-2 text-sm font-medium text-white hover:bg-white/25 transition-colors"
      >
        <Globe className="h-4 w-4" />
        {isArabic ? 'English' : 'العربية'}
      </button>

      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            واحد
          </h1>
          <p className="mt-1 text-base text-white/70 font-light tracking-wide">Wahid</p>
          <p className="mt-2 text-lg text-white/80">بوابة العمليات</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/20 bg-white p-8 shadow-2xl dark:bg-gray-800 dark:border-gray-700">

          {/* ── Login View ── */}
          {view === 'login' && (
            <>
              <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('login.welcomeBack')}
              </h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {t('login.signInSubtitle')}
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <Input
                  label={t('login.email')}
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="h-4 w-4" />}
                  required
                  autoComplete="email"
                />

                <div className="relative">
                  <Input
                    label={t('login.password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('login.passwordPlaceholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    icon={<Lock className="h-4 w-4" />}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => switchView('forgot')}
                    className="text-sm text-twn-600 hover:text-twn-700 font-medium transition-colors"
                  >
                    {t('login.forgotPassword')}
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                >
                  {t('login.signIn')}
                </Button>
              </form>
            </>
          )}

          {/* ── Forgot Password View ── */}
          {view === 'forgot' && (
            <>
              <button
                onClick={() => switchView('login')}
                className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('login.backToSignIn')}
              </button>

              <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('login.forgotPasswordTitle')}
              </h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {t('login.forgotPasswordSubtitle')}
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleForgot} className="space-y-4">
                <Input
                  label={t('login.email')}
                  type="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  icon={<Mail className="h-4 w-4" />}
                  required
                  autoComplete="email"
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                >
                  {t('login.sendResetCode')}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => switchView('reset')}
                  className="text-sm text-twn-600 hover:text-twn-700 font-medium transition-colors"
                >
                  {t('login.alreadyHaveCode')}
                </button>
              </div>
            </>
          )}

          {/* ── Reset Password View ── */}
          {view === 'reset' && (
            <>
              <button
                onClick={() => switchView('login')}
                className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('login.backToSignIn')}
              </button>

              <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('login.resetPasswordTitle')}
              </h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {t('login.resetPasswordSubtitle')}
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <Input
                  label={t('login.resetCode')}
                  type="text"
                  placeholder={t('login.resetCodePlaceholder')}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  icon={<KeyRound className="h-4 w-4" />}
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                />

                <div className="relative">
                  <Input
                    label={t('login.newPassword')}
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder={t('login.newPasswordPlaceholder')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    icon={<Lock className="h-4 w-4" />}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute end-3 top-[34px] text-gray-400 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                >
                  {t('login.resetPassword')}
                </Button>
              </form>
            </>
          )}
          {/* ── 2FA View ── */}
          {view === '2fa' && (
            <>
              <button
                onClick={() => { switchView('login'); setTotpCode(''); }}
                className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('login.backToSignIn')}
              </button>

              <h2 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t('login.2faTitle')}
              </h2>
              <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
                {t('login.2faSubtitle')}
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {success}
                </div>
              )}

              <form onSubmit={handle2FASubmit} className="space-y-4">
                <Input
                  label={t('login.authCode')}
                  type="text"
                  placeholder={t('login.authCodePlaceholder')}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  icon={<KeyRound className="h-4 w-4" />}
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={loading}
                >
                  {t('login.verify')}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/60">
          {t('login.footer')}
        </p>
      </div>
    </div>
  );
}
