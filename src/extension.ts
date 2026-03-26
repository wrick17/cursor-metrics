import * as vscode from "vscode";
import { configure, fetchUsageData, fetchUsageEvents, type UsagePayload, type UsageEvent } from "./cursor-api";
import { buildUsageOverviewMarkdown } from "./tooltip";

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastData: UsagePayload | null = null;
let lastError: string | null = null;
let lastFetchTime = 0;
let isFetching = false;
let lastEvents: UsageEvent[] | null = null;

const DEBOUNCE_MS = 30_000;

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("cursorUsage");
  return {
    pollInterval: cfg.get<number>("pollInterval", 5),
    minimalMode: cfg.get<boolean>("minimalMode", false),
    usageDuration: cfg.get<"1d" | "7d" | "30d">("usageDuration", "30d"),
  };
}

function getCooldownMs(): number {
  return getConfig().pollInterval * 60_000;
}

function scheduleRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    if (Date.now() - lastFetchTime >= getCooldownMs()) {
      updateUsage();
    }
  }, DEBOUNCE_MS);
}

function refreshOnFocus(state: vscode.WindowState) {
  if (state.focused && Date.now() - lastFetchTime >= getCooldownMs()) {
    updateUsage();
  }
}

function formatResetDate(iso: string): string {
  const resetDate = new Date(iso);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(diffMs / 86_400_000));
  const formatted = resetDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} on ${formatted}`;
}

function isLightTheme(): boolean {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
}

function progressBarDataUri(ratio: number, barWidth = 220): string {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const width = barWidth;
  const height = 10;
  const r = height / 2;
  const fillWidth = Math.round(clamped * width);

  const light = isLightTheme();
  const trackColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)";
  const fillColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.82)";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${trackColor}"/>`;
  if (fillWidth > 0) {
    svg += `<rect width="${fillWidth}" height="${height}" rx="${r}" ry="${r}" fill="${fillColor}"/>`;
  }
  svg += `</svg>`;

  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function progressBarMarkdown(ratio: number, barWidth = 220): string {
  return `![](${progressBarDataUri(ratio, barWidth)})`;
}

function progressBarHtml(ratio: number, barWidth = 220): string {
  return `<img src="${progressBarDataUri(ratio, barWidth)}" width="${barWidth}" height="10" />`;
}

function summaryDividerHtml(height = 52): string {
  const light = isLightTheme();
  const strokeColor = light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="${height}" viewBox="0 0 2 ${height}">`,
    `<rect x="0.5" y="0" width="1" height="${height}" fill="${strokeColor}"/>`,
    `</svg>`,
  ].join("");
  const encoded = Buffer.from(svg).toString("base64");
  return `<img src="data:image/svg+xml;base64,${encoded}" width="2" height="${height}" />`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type ModelAggregate = { model: string; totalTokens: number; requests: number };
type OnDemandUsage = UsagePayload["onDemand"];

function aggregateByModel(events: UsageEvent[], duration: "1d" | "7d" | "30d"): ModelAggregate[] {
  const daysMap = { "1d": 1, "7d": 7, "30d": 30 };
  const cutoff = Date.now() - daysMap[duration] * 86_400_000;

  const map = new Map<string, { totalTokens: number; requests: number }>();
  for (const e of events) {
    if (e.timestamp < cutoff) continue;
    const entry = map.get(e.model) ?? { totalTokens: 0, requests: 0 };
    entry.totalTokens += e.totalTokens;
    entry.requests += e.requests;
    map.set(e.model, entry);
  }

  return [...map.entries()]
    .map(([model, agg]) => ({ model, ...agg }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

function isOnDemandVisible(onDemand: OnDemandUsage): boolean {
  return onDemand.state !== "disabled";
}

function getOnDemandRatio(onDemand: OnDemandUsage): number | null {
  if (onDemand.state !== "limited") return null;
  if (onDemand.limitDollars === null || onDemand.limitDollars <= 0) return null;
  return onDemand.spendDollars / onDemand.limitDollars;
}

function formatOnDemandStatus(onDemand: OnDemandUsage): string {
  if (onDemand.state === "unlimited") {
    return `$${onDemand.spendDollars.toFixed(2)}`;
  }
  return `$${onDemand.spendDollars.toFixed(2)}/$${(onDemand.limitDollars ?? 0).toFixed(2)}`;
}

function formatOnDemandTooltipCell(onDemand: OnDemandUsage): string {
  if (onDemand.state === "unlimited") {
    return `$${onDemand.spendDollars.toFixed(2)}`;
  }
  const ratio = getOnDemandRatio(onDemand);
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return `$${onDemand.spendDollars.toFixed(2)} / $${(onDemand.limitDollars ?? 0).toFixed(2)} (${pct}%)`;
}

function updateStatusBar(data: UsagePayload) {
  const { includedRequests, onDemand } = data;
  const { minimalMode } = getConfig();

  const premiumExhausted = includedRequests.used >= includedRequests.limit;
  const onDemandVisible = isOnDemandVisible(onDemand);

  if (minimalMode) {
    if (premiumExhausted && onDemandVisible) {
      statusBarItem.text = `$(pulse) ${formatOnDemandStatus(onDemand)}`;
    } else {
      statusBarItem.text = `$(pulse) ${includedRequests.used}/${includedRequests.limit}`;
    }
  } else {
    const includedText = `${includedRequests.used}/${includedRequests.limit}`;
    statusBarItem.text = onDemandVisible
      ? `$(pulse) ${includedText} | ${formatOnDemandStatus(onDemand)}`
      : `$(pulse) ${includedText}`;
  }

  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.supportThemeIcons = true;
  tooltip.supportHtml = true;

  const barW = 150;
  let md = `### $(pulse) Cursor Usage\n\n`;
  md += buildUsageOverviewMarkdown(
    { includedRequests, onDemand },
    {
      markdown: (ratio) => progressBarMarkdown(ratio, barW),
      html: (ratio) => progressBarHtml(ratio, barW),
      divider: () => summaryDividerHtml(),
    },
  );
  md += `\n`;

  if (lastEvents && lastEvents.length > 0) {
    const { usageDuration } = getConfig();
    const models = aggregateByModel(lastEvents, usageDuration);
    const label = { "1d": "24 hours", "7d": "7 days", "30d": "30 days" }[usageDuration];
    md += `<hr>\n\n`;
    md += `**Usage by Model** *(${label})* &nbsp;[Change](command:cursor-usage.openDurationSetting)\n\n`;
    if (models.length > 0) {
      md += `| Model | Tokens | Requests |\n`;
      md += `|:------|-------:|---------:|\n`;
      for (const m of models) {
        md += `| ${m.model} | ${formatTokens(m.totalTokens)} | ${m.requests} |\n`;
      }
      md += `\n`;
    } else {
      md += `*No usage in this period*\n\n`;
    }
  }

  if (data.resetsAt) {
    md += `<hr>\n\n`;
    md += `*Resets ${formatResetDate(data.resetsAt)}*\n\n`;
  }

  md += `<hr>\n\n`;
  md += `[Open Dashboard](https://cursor.com/dashboard) | [Refresh](command:cursor-usage.refresh)`;

  tooltip.appendMarkdown(md);
  statusBarItem.tooltip = tooltip;
}

async function updateUsage() {
  if (isFetching) return;
  isFetching = true;

  statusBarItem.text = statusBarItem.text.replace("$(pulse)", "$(loading~spin)");
  await new Promise((r) => setTimeout(r, 0));

  try {
    const [dataResult, eventsResult] = await Promise.allSettled([
      fetchUsageData(),
      fetchUsageEvents(),
    ]);

    if (eventsResult.status === "fulfilled") {
      lastEvents = eventsResult.value;
    } else if (eventsResult.status === "rejected") {
      log(`Usage events fetch failed: ${eventsResult.reason}`);
    }

    const data = dataResult.status === "fulfilled" ? dataResult.value : null;
    if (dataResult.status === "rejected") {
      log(`Usage data fetch failed: ${dataResult.reason}`);
    }

    if (data) {
      lastData = data;
      lastError = null;
      updateStatusBar(data);
    } else {
      lastError = "Could not fetch usage data";
      if (!lastData) {
        statusBarItem.text = "$(warning) Usage unavailable";
        statusBarItem.tooltip = "Could not fetch Cursor usage data. Click to see options.";
      } else {
        statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
      }
    }
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    log(`Error in updateUsage: ${msg}`);
    lastError = msg;
    if (!lastData) {
      statusBarItem.text = "$(warning) Usage unavailable";
      statusBarItem.tooltip = `Error: ${msg}`;
    } else {
      statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
    }
  } finally {
    isFetching = false;
    lastFetchTime = Date.now();
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
  const spendRatio = getOnDemandRatio(onDemand);
  const spendPct = spendRatio === null ? null : Math.round(spendRatio * 100);
  const onDemandVisible = isOnDemandVisible(onDemand);

  let message = `Requests: ${includedRequests.used}/${includedRequests.limit} (${reqPct}%)`;
  if (onDemandVisible) {
    const spendText = onDemand.state === "unlimited"
      ? `$${onDemand.spendDollars.toFixed(2)}`
      : `$${onDemand.spendDollars.toFixed(2)}/$${(onDemand.limitDollars ?? 0).toFixed(2)} (${spendPct ?? 0}%)`;
    message += ` | Spend: ${spendText}`;
  }
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
  const openDurationCmd = vscode.commands.registerCommand("cursor-usage.openDurationSetting", () => {
    vscode.commands.executeCommand("workbench.action.openSettings", "cursorUsage.usageDuration");
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if ((e.affectsConfiguration("cursorUsage.minimalMode") || e.affectsConfiguration("cursorUsage.usageDuration")) && lastData) {
      updateStatusBar(lastData);
    }
  });

  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.scheme === "file") {
      scheduleRefresh();
    }
  });

  const focusListener = vscode.window.onDidChangeWindowState(refreshOnFocus);

  const themeListener = vscode.window.onDidChangeActiveColorTheme(() => {
    if (lastData) updateStatusBar(lastData);
  });

  context.subscriptions.push(
    statusBarItem, showDetailsCmd, refreshCmd, openDurationCmd,
    configListener, docChangeListener, focusListener, themeListener,
    outputChannel,
  );

  log("Extension activated, fetching initial usage...");
  updateUsage();
}

export function deactivate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}
