import { useTranslation } from 'react-i18next';
import { Search, Moon, Sun, Globe, User, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { openCommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from './NotificationBell';

export interface HeaderProps {
  title?: string;
  onOpenTour?: () => void;
}

export function Header({ title, onOpenTour }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { isDark, toggle: toggleTheme } = useTheme();

  const isArabic = i18n.language === 'ar';

  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100';

  return (
    <header className="glass theme-transition sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 sm:px-6 dark:border-gray-800">
      {/* Left: page title */}
      <div className="flex min-w-0 items-center gap-3">
        {/* Spacer for the mobile hamburger */}
        <div className="w-8 lg:hidden" />
        <h1 className="truncate text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title ?? t('app.title')}
        </h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Command palette launcher (desktop) */}
        <button
          data-tour="search"
          onClick={openCommandPalette}
          className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 ps-3 pe-2 text-sm text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 md:flex lg:w-64 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:bg-gray-800"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-start">{t('header.search') ?? 'Search...'}</span>
          <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-900">
            ⌘K
          </kbd>
        </button>

        {/* Command palette launcher (mobile) */}
        <button
          onClick={openCommandPalette}
          className={`${iconBtn} md:hidden`}
          aria-label={t('cmd.title')}
        >
          <Search className="h-5 w-5" />
        </button>

        {onOpenTour && (
          <button data-tour="help" onClick={onOpenTour} className={iconBtn} title={t('header.takeTour')}>
            <HelpCircle className="h-5 w-5" />
          </button>
        )}

        <div data-tour="notifications">
          <NotificationBell />
        </div>

        {/* Language toggle */}
        <button
          data-tour="language"
          onClick={toggleLanguage}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          title={isArabic ? t('english') : t('arabic')}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{isArabic ? 'EN' : 'ع'}</span>
        </button>

        {/* Theme toggle */}
        <button onClick={toggleTheme} className={iconBtn} aria-label="Toggle theme">
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* Divider */}
        <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-800" />

        {/* User avatar */}
        <div className="flex items-center gap-2 ps-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-twn-500 to-twn-700 text-sm font-semibold text-white shadow-sm ring-1 ring-twn-600/20">
            {user?.fullName
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() ?? <User className="h-4 w-4" />}
          </div>
          <span className="hidden text-sm font-medium text-gray-700 lg:block dark:text-gray-300">
            {user?.fullName}
          </span>
        </div>
      </div>
    </header>
  );
}
