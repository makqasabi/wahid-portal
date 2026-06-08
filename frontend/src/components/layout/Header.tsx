import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Moon, Sun, Globe, User, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useFilterStore } from '@/stores/filterStore';
import { NotificationBell } from './NotificationBell';

export interface HeaderProps {
  title?: string;
  onOpenTour?: () => void;
}

export function Header({ title, onOpenTour }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const filterStore = useFilterStore();
  const { isDark, toggle: toggleTheme } = useTheme();
  const [searchValue, setSearchValue] = useState('');

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
        {/* Search */}
        <div data-tour="search" className="relative hidden md:block">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchValue.trim()) {
                filterStore.clearFilters();
                filterStore.setFilter('search', searchValue.trim());
                navigate('/tickets');
                setSearchValue('');
              }
            }}
            placeholder={t('header.search') ?? 'Search...'}
            className="h-9 w-48 rounded-lg border border-gray-200 bg-gray-50/80 ps-9 pe-3 text-sm text-gray-700 transition-all placeholder:text-gray-400 focus:w-64 focus:border-twn-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-twn-500/15 lg:w-56 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-200 dark:focus:bg-gray-900"
          />
        </div>

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
