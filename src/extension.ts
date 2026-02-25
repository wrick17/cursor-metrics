import * as vscode from "vscode";
import { configure, fetchUsageData, type UsagePayload } from "./cursor-api";

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let pollInterval: ReturnType<typeof setInterval> | undefined;
let lastData: UsagePayload | null = null;
let lastError: string | null = null;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function formatResetDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function progressBar(ratio: number, length = 20): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const filled = Math.round(clamped * length);
  return "\u2588".repeat(filled) + "\u2591".repeat(length - filled);
}

function updateStatusBar(data: UsagePayload) {
  const { includedRequests, onDemand } = data;

  statusBarItem.text = `$(pulse) ${includedRequests.used}/${includedRequests.limit} | $${onDemand.spendDollars.toFixed(2)}/$${onDemand.limitDollars}`;

  const reqRatio = includedRequests.limit > 0 ? includedRequests.used / includedRequests.limit : 0;
  const spendRatio = onDemand.limitDollars > 0 ? onDemand.spendDollars / onDemand.limitDollars : 0;

  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.supportThemeIcons = true;

  let md = `### $(pulse) Cursor Usage\n\n`;
  md += `**Included Requests**\n\n`;
  md += `${includedRequests.used} / ${includedRequests.limit} (${Math.round(reqRatio * 100)}%)\n\n`;
  md += `\`${progressBar(reqRatio)}\`\n\n`;
  md += `---\n\n`;
  md += `**On-Demand Spend**\n\n`;
  md += `$${onDemand.spendDollars.toFixed(2)} / $${onDemand.limitDollars.toFixed(2)} (${Math.round(spendRatio * 100)}%)\n\n`;
  md += `\`${progressBar(spendRatio)}\`\n\n`;

  if (data.resetsAt) {
    md += `---\n\n`;
    md += `*Resets ${formatResetDate(data.resetsAt)}*`;
  }

  tooltip.appendMarkdown(md);
  statusBarItem.tooltip = tooltip;
}

async function updateUsage() {
  try {
    const data = await fetchUsageData();
    if (data) {
      lastData = data;
      lastError = null;
      updateStatusBar(data);
    } else {
      lastError = "Could not fetch usage data";
      if (!lastData) {
        statusBarItem.text = "$(warning) Usage unavailable";
        statusBarItem.tooltip = "Could not fetch Cursor usage data. Click to see options.";
      }
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    log(`Error in updateUsage: ${msg}`);
    lastError = msg;
    if (!lastData) {
      statusBarItem.text = "$(warning) Usage unavailable";
      statusBarItem.tooltip = `Error: ${msg}`;
    }
  }
}

async function showDetails() {
  if (!lastData) {
    const items: string[] = ["Refresh", "Open Dashboard", "Show Logs"];
    const action = await vscode.window.showWarningMessage(
      lastError
        ? `Cursor usage unavailable: ${lastError}`
        : "Cursor usage data is not available yet.",
      ...items,
    );
    if (action === "Refresh") await updateUsage();
    else if (action === "Open Dashboard") vscode.env.openExternal(vscode.Uri.parse("https://cursor.com/dashboard"));
    else if (action === "Show Logs") outputChannel.show();
    return;
  }

  const { includedRequests, onDemand, resetsAt } = lastData;
  const reqPct = includedRequests.limit > 0 ? Math.round((includedRequests.used / includedRequests.limit) * 100) : 0;
  const spendPct = onDemand.limitDollars > 0 ? Math.round((onDemand.spendDollars / onDemand.limitDollars) * 100) : 0;

  let message = `Requests: ${includedRequests.used}/${includedRequests.limit} (${reqPct}%)`;
  message += ` | Spend: $${onDemand.spendDollars.toFixed(2)}/$${onDemand.limitDollars.toFixed(2)} (${spendPct}%)`;
  if (resetsAt) message += ` | Resets: ${formatResetDate(resetsAt)}`;

  const action = await vscode.window.showInformationMessage(
    message,
    "Open Dashboard",
    "Refresh",
  );

  if (action === "Open Dashboard") {
    vscode.env.openExternal(vscode.Uri.parse("https://cursor.com/dashboard"));
  } else if (action === "Refresh") {
    await updateUsage();
  }
}

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Cursor Usage");
  log("Extension activating...");

  configure({ logger: log });

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "cursor-usage.showDetails";
  statusBarItem.text = "$(loading~spin) Usage";
  statusBarItem.show();

  const showDetailsCmd = vscode.commands.registerCommand("cursor-usage.showDetails", showDetails);
  const refreshCmd = vscode.commands.registerCommand("cursor-usage.refresh", updateUsage);

  context.subscriptions.push(statusBarItem, showDetailsCmd, refreshCmd, outputChannel);

  log("Extension activated, fetching initial usage...");
  updateUsage();
  pollInterval = setInterval(updateUsage, 60_000);
}

export function deactivate() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = undefined;
  }
}
