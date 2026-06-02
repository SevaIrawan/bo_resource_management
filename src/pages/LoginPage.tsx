import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BrandLogoMark } from '@/components/brand/BrandLogoMark';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/hooks/useAuth';

function resolveLoginError(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return t('login.invalidCredentials');
    case 'SUPABASE_NOT_CONFIGURED':
      return t('login.supabaseNotConfigured');
    default:
      return t('login.loginFailed');
  }
}

export function LoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [configMissing, setConfigMissing] = useState<string[]>([]);

  useEffect(() => {
    const api = window.electronAPI?.app?.getConfigStatus;
    if (!api) return;
    void api().then((status) => {
      if (status.bundledOrgConfig || status.configured) return;
      setConfigMissing(status.missing);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(userName, password);
      navigate('/', { replace: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'LOGIN_FAILED';
      setError(resolveLoginError(code, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="login-card-header">
          <BrandLogoMark alt={t('brand.name')} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="login-card-title">{t('brand.name')}</h1>
            <p className="login-card-subtitle">{t('brand.tagline')}</p>
          </div>
        </header>

        <div className="login-divider" aria-hidden />

        <form onSubmit={handleSubmit}>
          {configMissing.length > 0 ? (
            <div className="login-error mb-3 space-y-2 text-left">
              <p>{t('login.configRequired')}</p>
              <p className="text-xs opacity-90">{configMissing.join(', ')}</p>
              {window.electronAPI?.app?.openConfigFolder ? (
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => void window.electronAPI?.app?.openConfigFolder()}
                >
                  {t('login.openConfigFolder')}
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="login-error">{error}</p> : null}

          <div className="login-field">
            <label htmlFor="login-username" className="login-field-label">
              {t('login.username')}
            </label>
            <div className="login-input-wrap">
              <User className="login-input-icon" strokeWidth={2} />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder={t('login.usernamePlaceholder')}
                disabled={loading}
                className="login-input login-input--plain"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password" className="login-field-label">
              {t('login.password')}
            </label>
            <div className="login-input-wrap">
              <Lock className="login-input-icon" strokeWidth={2} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
                disabled={loading}
                className="login-input"
              />
              <button
                type="button"
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={loading}
                className="login-input-toggle"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !userName.trim() || !password}
            className="login-submit"
          >
            {loading ? t('login.loading') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
