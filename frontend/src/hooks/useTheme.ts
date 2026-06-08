import { useEffect, useState } from 'react';
import { resolvedDark, toggleTheme, watchSystemTheme } from '@/lib/theme';

/** Reactive dark-mode state synced to the <html> class and the OS preference. */
export function useTheme() {
  const [isDark, setIsDark] = useState(resolvedDark);

  useEffect(() => watchSystemTheme(), []);

  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(resolvedDark()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => obs.disconnect();
  }, []);

  return { isDark, toggle: () => setIsDark(toggleTheme()) };
}
