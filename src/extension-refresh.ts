import * as vscode from "vscode";
import {
  enrichUsageFromEvents,
  fetchDailySpendByCategory,
  fetchUsageData,
  fetchUsageEvents,
  isTeamMemberCached,
  type DailySpendRow,
  type UsagePayload,
  type UsageEvent,
} from "./cursor-api";
import { normalizeUsageEventRequests } from "./cursor-usage-parsing";
import { DashboardPanel, OPEN_DASHBOARD_COMMAND } from "./dashboard-panel";
import { buildConversationTitleMap } from "./conversation-titles";
import { CONVERSATION_PREVIEW_KEY } from "./dashboard-locale";
import { getDashboardLocale } from "./dashboard-locale-state";
import { getDashboardCurrency } from "./dashboard-currency-state";
import type { DashboardCurrency, DashboardLocale } from "./dashboard-locale";
import { isOnDemandVisible } from "./on-demand";
import { buildDashboardState, type DashboardState } from "./dashboard-state";
import { MAX_STORE_SYNC_PAGES } from "./cursor-api-utils";
import { invalidateSetupCache } from "./cursor-setup-cache";
import { formatResetCountdown, t } from "./i18n";
import { formatStatusBarUsageText } from "./pool-usage";
import { shouldShowPremiumRequestsQuota } from "./usage-display";
import { UsageEventStore } from "./usage-event-store";
import { usageEventFingerprint } from "./usage-event-fingerprint";
import { updateStatusBar, type StatusBarConfig } from "./status-bar-content";
import { initPricingCatalogRefresh, refreshPricingCatalog } from "./pricing-catalog-refresh";
import { PricingCatalogStore } from "./pricing-catalog-store";

export { refreshPricingCatalog };

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastData: UsagePayload | null = null;
let lastError: string | null = null;
let lastFetchTime = 0;
let fetchPromise: Promise<void> | null = null;
let lastEvents: UsageEvent[] | null = null;
let lastDailySpend: DailySpendRow[] | null = null;
let extensionContext: vscode.ExtensionContext;
let eventStore: UsageEventStore | null = null;
let conversationTitles: Record<string, string> = {};
let conversationPreviewEnabled = false;
let storedEventCount = 0;
let lastWarnings: string[] = [];
let lastEventsComplete = true;
let pricingCatalogStore: PricingCatalogStore | null = null;

const STORE_LOOKBACK_DAYS = 120;
const DEBOUNCE_MS = 30_000;

export type UpdateUsageOptions = {
  force?: boolean;
};

export function initExtensionRefresh(
  context: vscode.ExtensionContext,
  barItem: vscode.StatusBarItem,
  channel: vscode.OutputChannel,
): void {
  extensionContext = context;
  statusBarItem = barItem;
  outputChannel = channel;
  conversationPreviewEnabled = isConversationPreviewEnabled();
  pricingCatalogStore = new PricingCatalogStore(context.globalStorageUri.fsPath);
  initPricingCatalogRefresh(
    pricingCatalogStore,
    getDashboardState,
    log,
    () => DashboardPanel.currentPanel?.postState(getDashboardState()),
  );
}

export function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  outputChannel.appendLine(`[${ts}] ${msg}`);
}

export function getConfig(): StatusBarConfig & { pollInterval: number; quotaAwareEventDisplay: boolean } {
  const cfg = vscode.workspace.getConfiguration("cursorUsage");
  const modelBreakdownSortBy = cfg.get<StatusBarConfig["modelBreakdownSortBy"]>("modelBreakdownSortBy", "tokens");
  const modelBreakdownSortOrder = cfg.get<StatusBarConfig["modelBreakdownSortOrder"]>("modelBreakdownSortOrder", "desc");
  return {
    pollInterval: cfg.get<number>("pollInterval", 5),
    minimalMode: cfg.get<boolean>("minimalMode", false),
    usageDuration: cfg.get<string>("usageDuration", "billingCycle"),
    modelBreakdownSortBy,
    modelBreakdownSortOrder,
    excludeZeroTokenModels: cfg.get<boolean>("excludeZeroTokenModels", false),
    quotaAwareEventDisplay: cfg.get<boolean>("quotaAwareEventDisplay", true),
  };
}

function getCooldownMs(): number {
  return getConfig().pollInterval * 60_000;
}

export function scheduleRefresh(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    if (Date.now() - lastFetchTime >= getCooldownMs()) {
      updateUsage();
    }
  }, DEBOUNCE_MS);
}

export function refreshOnFocus(state: vscode.WindowState): void {
  if (state.focused && Date.now() - lastFetchTime >= getCooldownMs()) {
    updateUsage();
  }
}

function getLocale(): DashboardLocale {
  return getDashboardLocale(extensionContext);
}

function getCurrency(): DashboardCurrency {
  return getDashboardCurrency(extensionContext);
}

function isConversationPreviewEnabled(): boolean {
  return extensionContext.globalState.get<boolean>(CONVERSATION_PREVIEW_KEY) === true;
}

async function ensureEventStore(): Promise<UsageEventStore> {
  if (!eventStore) {
    eventStore = new UsageEventStore(
      extensionContext.globalStorageUri.fsPath,
      extensionContext.extensionPath,
    );
    await eventStore.init();
  }
  return eventStore;
}

async function refreshConversationTitles(events: UsageEvent[]): Promise<number> {
  conversationPreviewEnabled = isConversationPreviewEnabled();
  if (!conversationPreviewEnabled) {
    conversationTitles = {};
    return 0;
  }
  const ids = events.map((event) => event.conversationId).filter((id): id is string => Boolean(id));
  conversationTitles = await buildConversationTitleMap(ids, extensionContext.extensionPath);
  return Object.keys(conversationTitles).length;
}

export async function handleConversationPreviewChange(previewEnabled: boolean): Promise<void> {
  conversationPreviewEnabled = previewEnabled;
  await extensionContext.globalState.update(CONVERSATION_PREVIEW_KEY, previewEnabled);
  const conversationCount = previewEnabled
    ? new Set((lastEvents ?? []).map((e) => e.conversationId).filter(Boolean)).size
    : 0;
  const titleCount = previewEnabled && lastEvents ? await refreshConversationTitles(lastEvents) : 0;
  if (!previewEnabled) {
    conversationTitles = {};
  }
  DashboardPanel.currentPanel?.postPreviewStatus(previewEnabled, titleCount, conversationCount);
  DashboardPanel.currentPanel?.postState(getDashboardState());
}

async function loadStoredEvents(): Promise<UsageEvent[]> {
  const store = await ensureEventStore();
  storedEventCount = store.getEventCount();
  const since = Date.now() - STORE_LOOKBACK_DAYS * 86_400_000;
  return store.getEventsSince(since);
}

function buildStatusBarContext() {
  const config = getConfig();
  return {
    statusBarItem,
    locale: getLocale(),
    currency: getCurrency(),
    config,
    lastEvents,
    lastDailySpend,
    getDashboardEventFilter: DashboardPanel.getDashboardEventFilter,
  };
}

export function refreshStatusBarFromLastData(): void {
  if (lastData) {
    updateStatusBar(lastData, buildStatusBarContext());
  }
}

export async function updateUsage(opts?: UpdateUsageOptions): Promise<void> {
  const force = opts?.force ?? false;
  while (fetchPromise) {
    if (!force) return;
    await fetchPromise;
  }

  const run = runUpdateUsage(force);
  fetchPromise = run;
  try {
    await run;
  } finally {
    if (fetchPromise === run) {
      fetchPromise = null;
    }
  }
}

async function runUpdateUsage(force: boolean): Promise<void> {
  statusBarItem.text = statusBarItem.text.replace("$(pulse)", "$(loading~spin)");
  await new Promise((r) => setTimeout(r, 0));

  if (force) {
    invalidateSetupCache();
  }

  const storeSince = Date.now() - STORE_LOOKBACK_DAYS * 86_400_000;
  const locale = getLocale();
  const warnings: string[] = [];
  let eventsComplete = true;

  try {
    const [dataResult, eventsResult] = await Promise.allSettled([
      fetchUsageData(),
      fetchUsageEvents({ maxPages: MAX_STORE_SYNC_PAGES, lookbackDays: STORE_LOOKBACK_DAYS }),
    ]);

    const data = dataResult.status === "fulfilled" ? dataResult.value : null;
    if (dataResult.status === "rejected") {
      log(`Usage data fetch failed: ${dataResult.reason}`);
    }

    const resetsAtForSpend = data?.resetsAt ?? lastData?.resetsAt ?? null;
    try {
      lastDailySpend = await fetchDailySpendByCategory({ resetAtIso: resetsAtForSpend });
    } catch (err: unknown) {
      log(`Daily spend fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      warnings.push(t(locale, "warningSpendFetchFailed"));
    }

    if (eventsResult.status === "fulfilled") {
      const { events: apiEvents, complete } = eventsResult.value;
      eventsComplete = complete;
      if (!complete) {
        warnings.push(t(locale, "warningEventsIncomplete"));
      }
      try {
        const store = await ensureEventStore();
        if (force && complete) {
          store.syncEventsFromApi(apiEvents, storeSince, { allowEmpty: true });
          store.flushPersist();
        } else {
          store.upsertEvents(apiEvents);
        }
        lastEvents = await loadStoredEvents();
      } catch (err: unknown) {
        log(`Event store sync failed: ${err instanceof Error ? err.message : String(err)}`);
        warnings.push(t(locale, "warningEventStoreSyncFailed"));
        lastEvents = apiEvents;
      }
      await refreshConversationTitles(lastEvents ?? []);
    } else if (eventsResult.status === "rejected") {
      log(`Usage events fetch failed: ${eventsResult.reason}`);
      eventsComplete = false;
      warnings.push(t(locale, "warningEventsFetchFailed"));
    }

    lastWarnings = warnings;
    lastEventsComplete = eventsComplete;

    if (data) {
      const eventsForEnrichment = lastEvents ?? [];
      const enriched = enrichUsageFromEvents(data, eventsForEnrichment, Date.now());
      lastData = enriched;
      lastError = null;
      updateStatusBar(enriched, buildStatusBarContext());
    } else {
      lastError = "Could not fetch usage data";
      if (!lastData) {
        statusBarItem.text = `$(warning) ${t(locale, "usageUnavailable")}`;
        statusBarItem.tooltip = t(locale, "fetchError");
      } else {
        statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
        updateStatusBar(lastData, buildStatusBarContext());
      }
    }

    DashboardPanel.currentPanel?.postState(getDashboardState());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Error in updateUsage: ${msg}`);
    lastError = msg;
    if (!lastData) {
      statusBarItem.text = `$(warning) ${t(locale, "usageUnavailable")}`;
      statusBarItem.tooltip = `${t(locale, "errorPrefix")}: ${msg}`;
    } else {
      statusBarItem.text = statusBarItem.text.replace("$(loading~spin)", "$(pulse)");
    }
    DashboardPanel.currentPanel?.postState(getDashboardState());
  } finally {
    lastFetchTime = Date.now();
  }
}

export async function showDetails(): Promise<void> {
  if (!lastData) {
    const items: string[] = ["Refresh", "Open Dashboard", "Show Logs"];
    const action = await vscode.window.showWarningMessage(
      lastError
        ? `Cursor usage unavailable: ${lastError}`
        : "Cursor usage data is not available yet.",
      ...items,
    );
    if (action === "Refresh") await updateUsage({ force: true });
    else if (action === "Open Dashboard") await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
    else if (action === "Show Logs") outputChannel.show();
    return;
  }

  const { onDemand, resetsAt } = lastData;
  const onDemandVisible = isOnDemandVisible(onDemand);
  const showPremiumRequests = shouldShowPremiumRequestsQuota(lastData.planInfo, lastData.poolUsage);

  let message = `${formatStatusBarUsageText(lastData, {
    onDemandVisible,
    showPremiumRequests,
    currency: getCurrency(),
    locale: getLocale(),
  })}`;
  if (resetsAt) message += ` | ${formatResetCountdown(resetsAt, getLocale())}`;

  const action = await vscode.window.showInformationMessage(
    message,
    "Open Dashboard",
    "Refresh",
  );

  if (action === "Open Dashboard") {
    await vscode.commands.executeCommand(OPEN_DASHBOARD_COMMAND);
  } else if (action === "Refresh") {
    await updateUsage({ force: true });
  }
}

export function getDashboardState(): DashboardState {
  const now = Date.now();
  const rawEvents = lastEvents ?? [];
  const allEvents = rawEvents.map((event) => {
    const normalized = normalizeUsageEventRequests(event);
    return { ...normalized, eventKey: usageEventFingerprint(normalized) };
  });
  // Send the full event archive to the webview. Range / usage filters are applied
  // client-side for charts and tables; pool pacing also needs the unfiltered history.
  return buildDashboardState(
    lastData,
    allEvents,
    lastDailySpend ?? [],
    isTeamMemberCached(),
    lastError,
    now,
    getConfig().quotaAwareEventDisplay,
    conversationPreviewEnabled ? conversationTitles : {},
    storedEventCount,
    allEvents,
    lastWarnings,
    lastEventsComplete,
  );
}

export function cleanupExtensionRefresh(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  fetchPromise = null;
  eventStore?.close();
  eventStore = null;
}

export function getOutputChannel(): vscode.OutputChannel {
  return outputChannel;
}
