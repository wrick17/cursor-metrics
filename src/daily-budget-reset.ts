import type { DashboardLocale } from "./dashboard-locale";
import { getDateLocale, t, tf } from "./i18n";

const DAY_MS = 86_400_000;

function startOfUtcDay(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function getNextDailyBudgetResetMs(now = Date.now()): number {
  return startOfUtcDay(now) + DAY_MS;
}

function formatLocalResetTime(resetMs: number, locale: DashboardLocale): string {
  return new Date(resetMs).toLocaleTimeString(getDateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDailyBudgetResetCountdown(
  locale: DashboardLocale,
  now = Date.now(),
  resetMs = getNextDailyBudgetResetMs(now),
): string {
  const msLeft = resetMs - now;
  const time = formatLocalResetTime(resetMs, locale);

  if (msLeft <= 0) {
    return tf(locale, "dailyBudgetResetNow", { time });
  }

  const totalMinutes = Math.floor(msLeft / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return tf(locale, "dailyBudgetResetIn", { hours, minutes, time });
  }

  return tf(locale, "dailyBudgetResetInMinutes", { minutes, time });
}
