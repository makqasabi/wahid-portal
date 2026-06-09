import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  label?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}

/** Accessible searchable single-select (Radix Popover + cmdk). Drop-in for Select. */
export function Combobox({
  label,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  error,
  disabled,
  id,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const fieldId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            id={fieldId}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            className={cn(
              'flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 text-sm shadow-sm transition-all dark:bg-gray-900',
              'focus:outline-none focus:ring-4',
              'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-950',
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15'
                : 'border-gray-300 hover:border-gray-400 focus:border-twn-500 focus:ring-twn-500/15 dark:border-gray-700 dark:hover:border-gray-600',
              selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400',
            )}
          >
            <span className="truncate text-start">{selected ? selected.label : placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[60] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-lifted data-[state=open]:animate-scale-in dark:border-gray-800 dark:bg-gray-900"
          >
            <Command
              filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
            >
              <div className="flex items-center gap-2 border-b border-gray-200 px-3 dark:border-gray-800">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <Command.Input
                  placeholder={searchPlaceholder ?? placeholder}
                  className="h-10 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100"
                />
              </div>
              <Command.List className="max-h-60 overflow-y-auto p-1">
                <Command.Empty className="px-3 py-6 text-center text-sm text-gray-400">
                  {emptyText ?? 'No results'}
                </Command.Empty>
                {options.map((opt) => (
                  <Command.Item
                    key={opt.value}
                    value={opt.label}
                    onSelect={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:text-gray-200 dark:data-[selected=true]:bg-gray-800"
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && <Check className="h-4 w-4 shrink-0 text-twn-600" />}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
