import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import type { Progress, Priority } from '@/types';

/**
 * Merge Tailwind classes with clsx — handles conflicts correctly.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to "DD MMM YYYY" (e.g. "07 May 2026").
 */
export function formatDate(date: string): string {
  return format(new Date(date), 'dd MMM yyyy');
}

/**
 * Format a date string to "DD MMM YYYY, HH:mm" (e.g. "07 May 2026, 14:30").
 */
export function formatDateTime(date: string): string {
  return format(new Date(date), 'dd MMM yyyy, HH:mm');
}

/**
 * Return Tailwind color class for a given progress status.
 */
export function getProgressColor(progress: Progress): string {
  const colors: Record<Progress, string> = {
    COMPLETED: 'text-green-500 bg-green-50 border-green-200',
    IN_PROGRESS: 'text-blue-500 bg-blue-50 border-blue-200',
    DELAYED: 'text-red-500 bg-red-50 border-red-200',
    ON_HOLD: 'text-gray-500 bg-gray-50 border-gray-200',
    DEPENDENT: 'text-orange-500 bg-orange-50 border-orange-200',
  };
  return colors[progress];
}

/**
 * Return Tailwind color class for a given priority.
 */
export function getPriorityColor(priority: Priority): string {
  const colors: Record<Priority, string> = {
    CRITICAL: 'text-red-700 bg-red-100 border-red-300',
    HIGH: 'text-orange-700 bg-orange-100 border-orange-300',
    MEDIUM: 'text-yellow-700 bg-yellow-100 border-yellow-300',
    LOW: 'text-gray-600 bg-gray-100 border-gray-300',
  };
  return colors[priority];
}

/**
 * Return a Tailwind color class based on SLA variance days.
 * Positive = ahead of schedule, negative = behind.
 * null = no SLA set.
 */
export function getSlaColor(days: number | null): string {
  if (days === null || days === undefined) return 'text-gray-400';
  if (days >= 3) return 'text-green-500';
  if (days >= 0) return 'text-yellow-500';
  return 'text-red-500';
}

/**
 * Truncate text to a maximum length with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Check if an entity name refers to Meena/مينا.
 */
export function isMeenaEntity(name?: string): boolean {
  if (!name) return false;
  return name.includes('مينا') || name.toLowerCase().includes('meena');
}

/**
 * Pick the right localized name from an object that has `name` (Arabic) and `nameEn` (English).
 * Falls back to `name` if `nameEn` is missing.
 */
export function localName(obj: { name?: string; nameEn?: string | null } | undefined | null, lang: string): string {
  if (!obj) return '-';
  if (lang === 'ar' || !obj.nameEn) return obj.name ?? '-';
  return obj.nameEn;
}
