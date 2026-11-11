/**
 * Deadlines are picked as a date ("2026-11-20") and mean the end of that day
 * in the department's timezone.
 */

/** True for IANA time zone names this runtime knows, like "Africa/Lagos" or "UTC". */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Minutes the timezone is ahead of UTC at a given moment (e.g. +60 for Africa/Lagos). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** "2026-11-20" in `timeZone` → the last millisecond of that day, as a Date. */
export function endOfDayIn(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 23, 59, 59, 999);
  const offset = timeZoneOffsetMinutes(timeZone, new Date(guess));
  return new Date(guess - offset * 60_000);
}

/** The calendar date ("YYYY-MM-DD") of a moment in `timeZone`, for date inputs. */
export function dateInputValue(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function formatDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(at);
}

/** "Fri 14 Nov": short enough for a board card. The year is added when it isn't this year. */
export function formatShortDay(at: Date, timeZone: string, now: Date = new Date()): string {
  const sameYear = dateInputValue(at, timeZone).slice(0, 4) === dateInputValue(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(at)
    .replace(",", "");
}

export function isOverdue(deadline: Date | null, completedAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(deadline && !completedAt && deadline.getTime() < now.getTime());
}

/** Shifts a "YYYY-MM-DD" calendar date by whole days. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** This calendar week, Monday to Sunday, in `timeZone`, as "YYYY-MM-DD" dates. */
export function weekRange(now: Date, timeZone: string): { start: string; end: string } {
  const today = dateInputValue(now, timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -((weekday + 6) % 7));
  return { start, end: addDays(start, 6) };
}

/** Is the deadline (end of a picked day) inside this calendar week? */
export function isDueThisWeek(deadline: Date | null, timeZone: string, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const { start, end } = weekRange(now, timeZone);
  const day = dateInputValue(deadline, timeZone);
  return day >= start && day <= end;
}
