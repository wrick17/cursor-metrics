export const DASHBOARD_LOCALE_KEY = "dashboard.locale";
export const DASHBOARD_CURRENCY_KEY = "dashboard.currency";
export const CONVERSATION_PREVIEW_KEY = "dashboard.conversationPreview";
export type DashboardLocale = "en" | "it";
export type DashboardCurrency = "usd" | "eur";

export const DEFAULT_EUR_USD_RATE = 0.92;

export function isDashboardLocale(value: unknown): value is DashboardLocale {
  return value === "en" || value === "it";
}

export function isDashboardCurrency(value: unknown): value is DashboardCurrency {
  return value === "usd" || value === "eur";
}
