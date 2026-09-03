import * as vscode from "vscode";
import { DASHBOARD_CURRENCY_KEY, isDashboardCurrency, type DashboardCurrency } from "./dashboard-locale";

export function getDashboardCurrency(context: vscode.ExtensionContext): DashboardCurrency {
  const saved = context.globalState.get<DashboardCurrency>(DASHBOARD_CURRENCY_KEY);
  if (isDashboardCurrency(saved)) return saved;
  return "usd";
}
