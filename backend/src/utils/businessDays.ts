/**
 * Counts the number of business days between two dates (exclusive of end date).
 *
 * @param start  - Start date
 * @param end    - End date
 * @param workWeekDays - Array of day-of-week numbers (0 = Sunday .. 6 = Saturday)
 *                       that are considered working days.
 * @returns Number of business days between start and end
 */
export function calcBusinessDays(start: Date, end: Date, workWeekDays: number[]): number {
  const workDaySet = new Set(workWeekDays);
  let count = 0;

  // Normalize to midnight UTC to avoid timezone drift
  const current = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const target = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));

  // Handle reversed ranges
  const direction = current <= target ? 1 : -1;

  while (
    direction === 1
      ? current < target
      : current > target
  ) {
    if (workDaySet.has(current.getUTCDay())) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + direction);
  }

  return count;
}

/**
 * Returns the number of calendar days between two dates.
 * Result is always non-negative.
 */
export function calcCalendarDays(start: Date, end: Date): number {
  const msPerDay = 86_400_000;
  return Math.abs(Math.round((end.getTime() - start.getTime()) / msPerDay));
}

/**
 * Parses a comma-separated work-week configuration string into an
 * array of day-of-week numbers.
 *
 * @example parseWorkWeek("0,1,2,3,4") => [0, 1, 2, 3, 4]
 */
export function parseWorkWeek(config: string): number[] {
  return config
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
}
