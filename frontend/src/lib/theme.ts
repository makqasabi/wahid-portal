export type ThemePref = 'light' | 'dark' | null; // null = follow system

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolvedDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function getStoredTheme(): ThemePref {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? v : null;
}

function applyDark(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

/** Persist an explicit theme (or null to follow the system) and apply it. */
export function setTheme(pref: ThemePref): void {
  if (pref === null) localStorage.removeItem('theme');
  else localStorage.setItem('theme', pref);
  applyDark(pref === null ? systemPrefersDark() : pref === 'dark');
}

/** Flip light/dark, persisting the explicit choice. Returns the new isDark. */
export function toggleTheme(): boolean {
  const next = !resolvedDark();
  setTheme(next ? 'dark' : 'light');
  return next;
}

/** Track OS changes while the user has no explicit preference. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    if (getStoredTheme() === null) applyDark(e.matches);
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
