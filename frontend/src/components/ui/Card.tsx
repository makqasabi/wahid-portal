import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
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
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200/80 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900',
        padding && 'p-5 sm:p-6',
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <div
          className={cn(
            'flex items-center justify-between gap-3',
            padding ? 'mb-5' : 'mb-5 px-5 pt-5 sm:px-6 sm:pt-6',
          )}
        >
          {title && (
            <h3 className="text-[0.95rem] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
