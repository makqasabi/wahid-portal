import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Ticket,
  Plus,
  ShieldCheck,
  Search,
  Sun,
  Moon,
  Globe,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

/** Open the command palette from anywhere (e.g. a header button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event('open-command-palette'));
}

const itemClass =
  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:text-gray-200 dark:data-[selected=true]:bg-gray-800 dark:data-[selected=true]:text-gray-50';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { hasMinRole, logout } = useAuth();
  const { isDark, toggle } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    setQuery('');
    fn();
  };
  const go = (path: string) => run(() => navigate(path));
  const toggleLang = () => {
    const n = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(n);
    document.documentElement.dir = n === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = n;
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label={t('cmd.title')}
      shouldFilter
      overlayClassName="fixed inset-0 z-[60] bg-gray-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0"
      contentClassName="fixed left-1/2 top-[12vh] z-[60] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl data-[state=open]:animate-scale-in dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-800">
        <Search className="h-4 w-4 shrink-0 text-gray-400" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('cmd.placeholder')}
          className="h-12 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
        />
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-gray-400">
          {t('cmd.empty')}
        </Command.Empty>

        {query.trim() && (
          <Command.Group
            heading={t('cmd.search')}
            className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400"
          >
            <Command.Item
              value={`search ${query}`}
              onSelect={() => go(`/tickets?search=${encodeURIComponent(query.trim())}`)}
              className={itemClass}
            >
              <Search className="h-4 w-4 text-gray-400" />
              {t('cmd.searchFor', { q: query.trim() })}
            </Command.Item>
          </Command.Group>
        )}

        <Command.Group
          heading={t('cmd.navigate')}
          className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400"
        >
          <Command.Item value="dashboard" onSelect={() => go('/dashboard')} className={itemClass}>
            <LayoutDashboard className="h-4 w-4 text-gray-400" />
            {t('nav.dashboard')}
          </Command.Item>
          <Command.Item value="tickets" onSelect={() => go('/tickets')} className={itemClass}>
            <Ticket className="h-4 w-4 text-gray-400" />
            {t('nav.tickets')}
          </Command.Item>
          <Command.Item value="create ticket" onSelect={() => go('/tickets/create')} className={itemClass}>
            <Plus className="h-4 w-4 text-gray-400" />
            {t('createTicket')}
          </Command.Item>
          {hasMinRole('ENTITY_ADMIN') && (
            <Command.Item value="admin" onSelect={() => go('/admin')} className={itemClass}>
              <ShieldCheck className="h-4 w-4 text-gray-400" />
              {t('nav.admin')}
            </Command.Item>
          )}
        </Command.Group>

        <Command.Group
          heading={t('cmd.actions')}
          className="px-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400"
        >
          <Command.Item value="toggle theme dark light" onSelect={() => run(toggle)} className={itemClass}>
            {isDark ? <Sun className="h-4 w-4 text-gray-400" /> : <Moon className="h-4 w-4 text-gray-400" />}
            {t('cmd.toggleTheme')}
          </Command.Item>
          <Command.Item value="language arabic english" onSelect={() => run(toggleLang)} className={itemClass}>
            <Globe className="h-4 w-4 text-gray-400" />
            {t('cmd.toggleLang')}
          </Command.Item>
          <Command.Item value="logout sign out" onSelect={() => run(() => logout())} className={itemClass}>
            <LogOut className="h-4 w-4 text-gray-400" />
            {t('nav.logout')}
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
