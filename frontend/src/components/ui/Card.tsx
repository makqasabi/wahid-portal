import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  actions?: ReactNode;
  padding?: boolean;
}

export function Card({
  children,
  className,
  title,
  actions,
  padding = true,
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800',
        padding && 'p-6',
        className,
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            'flex items-center justify-between',
            padding ? 'mb-4' : 'mb-4 px-6 pt-6',
          )}
        >
          {title && (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
