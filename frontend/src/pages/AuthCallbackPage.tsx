import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Lands here after the server-side OIDC redirect. Trades the one-time ticket
 * for an access token + user, then continues into the app.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const ticket = params.get('ticket');
    if (!ticket) {
      navigate('/login?sso_error=expired', { replace: true });
      return;
    }

    authApi
      .ssoExchange(ticket)
      .then((res) => {
        setSession(res.user, res.accessToken);
        navigate('/dashboard', { replace: true });
      })
      .catch(() => {
        navigate('/login?sso_error=failed', { replace: true });
      });
  }, [params, navigate, setSession]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 dark:bg-gray-950">
      <Spinner size="lg" />
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('login.signingIn') ?? 'Signing you in…'}
      </p>
    </div>
  );
}
