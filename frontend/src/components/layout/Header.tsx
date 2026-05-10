import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Moon, Sun, Globe, User, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true') {
      document.documentElement.classList.add('dark');
      return true;
    }
    return false;
  });
  const [searchValue, setSearchValue] = useState('');

  const isArabic = i18n.language === 'ar';

  const toggleLanguage = () => {
    const newLang = isArabic ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-900">
      {/* Left: page title */}
      <div className="flex items-center gap-4">
        {/* Spacer for mobile hamburger */}
        <div className="w-8 lg:hidden" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title ?? t('app.title')}
        </h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div data-tour="search" className="relative hidden md:block">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
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
            className="h-9 w-56 rounded-lg border border-gray-200 bg-gray-50 ps-9 pe-3 text-sm text-gray-700 placeholder-gray-400 focus:border-twn-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-twn-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-800"
          />
        </div>

        {/* Tour help button */}
        {onOpenTour && (
          <button
            data-tour="help"
            onClick={onOpenTour}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title={t('header.takeTour')}
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        )}

        {/* Notification bell */}
        <div data-tour="notifications">
          <NotificationBell />
        </div>

        {/* Language toggle */}
        <button
          data-tour="language"
          onClick={toggleLanguage}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          title={isArabic ? t('english') : t('arabic')}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{isArabic ? 'EN' : 'AR'}</span>
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-twn-600 text-white text-sm font-medium">
            {user?.fullName
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() ?? <User className="h-4 w-4" />}
          </div>
          <span className="hidden text-sm font-medium text-gray-700 sm:block dark:text-gray-300">
            {user?.fullName}
          </span>
        </div>
      </div>
    </header>
  );
}
