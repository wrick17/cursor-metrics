import * as vscode from "vscode";
import { DASHBOARD_LOCALE_KEY, isDashboardLocale, type DashboardLocale } from "./dashboard-locale";

export function getDashboardLocale(context: vscode.ExtensionContext): DashboardLocale {
  const saved = context.globalState.get<DashboardLocale>(DASHBOARD_LOCALE_KEY);
  if (isDashboardLocale(saved)) return saved;
  if (vscode.env.language.startsWith("it")) return "it";
  return "en";
}
