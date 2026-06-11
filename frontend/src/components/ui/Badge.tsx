import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';
  dot?: boolean;
  className?: string;
  /** Admin-defined hex color (dynamic workflow) — overrides variant styling. */
  colorHex?: string;
}

const variantClasses: Record<string, string> = {
  default:
    'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  brand:
    'bg-twn-50 text-twn-700 ring-twn-600/20 dark:bg-twn-500/10 dark:text-twn-300 dark:ring-twn-400/20',
  success:
    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  danger:
    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  info:
    'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
  neutral:
    'bg-gray-50 text-gray-500 ring-gray-200 dark:bg-gray-800/60 dark:text-gray-400 dark:ring-gray-700',
};

const dotClasses: Record<string, string> = {
  default: 'bg-gray-400',
  brand: 'bg-twn-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-gray-400',
};

export function Badge({ children, variant = 'default', dot = false, className, colorHex }: BadgeProps) {
  if (colorHex) {
    // Hex-driven (dynamic workflow): tinted background + colored text/ring/dot
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
          className,
        )}
        style={{
          backgroundColor: `${colorHex}1a`,
          color: colorHex,
          boxShadow: `inset 0 0 0 1px ${colorHex}33`,
        }}
      >
        {dot && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: colorHex }}
          />
        )}
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        variantClasses[variant],
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClasses[variant])} />}
      {children}
    </span>
  );
}
