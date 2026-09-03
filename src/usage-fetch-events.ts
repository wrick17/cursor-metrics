import { cursorHeaders, getCursorToken } from "./cursor-auth";
import { apiLog } from "./cursor-api-logger";
import type { AuthInfo, CursorHeaders, DailySpendRow, SetupCache, UsageEvent } from "./cursor-api-types";
import { asRecord, MAX_USAGE_EVENT_PAGES, toNumber, withTimeout } from "./cursor-api-utils";
import { ensureSetup } from "./cursor-setup";
import { normalizeUsageEventRequests, parseUsageEvent } from "./cursor-usage-parsing";

import { getBillingCycleCutoff } from "./cursor-api-utils";

export type FetchDailySpendOptions = {
  resetAtIso?: string | null;
  periodStartMs?: number;
  periodEndMs?: number;
};

function resolveDailySpendPeriod(opts?: FetchDailySpendOptions): { periodStartMs: number; periodEndMs: number } {
  const periodEndMs = opts?.periodEndMs ?? Date.now();
  if (opts?.periodStartMs !== undefined) {
    return { periodStartMs: opts.periodStartMs, periodEndMs };
  }
  if (opts?.resetAtIso) {
    return {
      periodStartMs: getBillingCycleCutoff(opts.resetAtIso, periodEndMs),
      periodEndMs,
    };
  }
  return {
    periodStartMs: periodEndMs - 31 * 86_400_000,
    periodEndMs,
  };
}

function parseDailySpendRow(row: unknown): DailySpendRow | null {
  const data = asRecord(row);
  if (!data) return null;

  const day = toNumber(data.day);
  const category = typeof data.category === "string" ? data.category : null;
  const spendCents = toNumber(data.spendCents);
  const totalTokens = toNumber(data.totalTokens);

  if (day === null || !category || spendCents === null || totalTokens === null) {
    return null;
  }

  return {
    day,
    category,
    spendCents,
    totalTokens,
  };
}

async function resolveDashboardUserId(
  auth: AuthInfo,
  headers: CursorHeaders,
  setup: SetupCache,
): Promise<number | null> {
  const directUserId = toNumber(auth.userId);
  if (directUserId !== null) {
    return directUserId;
  }

  if (!setup.isTeamMember || !setup.teamId) {
    return null;
  }

  const res = await fetch("https://cursor.com/api/dashboard/get-team-spend", withTimeout({
    method: "POST",
    headers,
    body: JSON.stringify({ teamId: setup.teamId }),
  }));
  if (!res.ok) {
    apiLog(`get-team-spend failed while resolving dashboard user id: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const members: unknown[] = Array.isArray(data.teamMemberSpend) ? data.teamMemberSpend : [];
  for (const member of members) {
    const record = asRecord(member);
    if (!record) continue;

    const memberEmail = typeof record.email === "string" ? record.email : null;
    const memberAuthId = typeof record.authId === "string" ? record.authId : null;
    const memberUserId = toNumber(record.userId);
    if (memberUserId === null) continue;

    if (
      (auth.email && memberEmail === auth.email) ||
      (memberAuthId && memberAuthId === auth.userId) ||
      String(record.userId) === auth.userId
    ) {
      return memberUserId;
    }
  }

  apiLog(`Could not resolve dashboard user id from team spend (email=${auth.email}, userId=${auth.userId})`);
  return null;
}

export async function fetchDailySpendByCategory(
  opts?: FetchDailySpendOptions,
): Promise<DailySpendRow[]> {
  apiLog("--- Fetching daily spend by category ---");

  const auth = await getCursorToken();
  if (!auth) {
    apiLog("Failed to get auth token for daily spend");
    return [];
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, auth.sessionToken, headers, auth.email);
  if (!setup?.isTeamMember || !setup.teamId) {
    apiLog("Skipping daily spend fetch: team setup unavailable");
    return [];
  }

  const dashboardUserId = await resolveDashboardUserId(auth, headers, setup);
  if (dashboardUserId === null) {
    apiLog("Skipping daily spend fetch: dashboard user id unavailable");
    return [];
  }

  const { periodStartMs, periodEndMs } = resolveDailySpendPeriod(opts);
  const res = await fetch("https://cursor.com/api/dashboard/get-daily-spend-by-category", withTimeout({
    method: "POST",
    headers,
    body: JSON.stringify({
      teamId: setup.teamId,
      userId: dashboardUserId,
      periodStartMs,
      periodEndMs,
      groupBy: 1,
      spendType: 1,
    }),
  }));

  if (!res.ok) {
    apiLog(`get-daily-spend-by-category failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const rows: unknown[] = Array.isArray(data.dailySpend) ? data.dailySpend : [];
  const parsedRows: DailySpendRow[] = [];
  for (const row of rows) {
    const parsed = parseDailySpendRow(row);
    if (parsed) parsedRows.push(parsed);
  }
  apiLog(`Fetched ${parsedRows.length} daily spend rows`);
  return parsedRows;
}

export type FetchUsageEventsOptions = {
  maxPages?: number;
  lookbackDays?: number;
};

export type FetchUsageEventsResult = {
  events: UsageEvent[];
  /** True when the full lookback window was retrieved without auth/HTTP failure or page-cap truncation. */
  complete: boolean;
};

export async function fetchUsageEvents(opts: FetchUsageEventsOptions = {}): Promise<FetchUsageEventsResult> {
  apiLog("--- Fetching usage events ---");

  const auth = await getCursorToken();
  if (!auth) {
    apiLog("Failed to get auth token for events");
    return { events: [], complete: false };
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, auth.sessionToken, headers, auth.email);
  const teamId = setup?.teamId ?? 0;

  const endDate = Date.now();
  const lookbackDays = opts.lookbackDays ?? 31;
  const maxPages = opts.maxPages ?? MAX_USAGE_EVENT_PAGES;
  const startDate = endDate - lookbackDays * 86_400_000;
  const pageSize = 500;
  let page = 1;
  const allEvents: UsageEvent[] = [];
  let complete = true;

  while (page <= maxPages) {
    const res = await fetch("https://cursor.com/api/dashboard/get-filtered-usage-events", withTimeout({
      method: "POST",
      headers,
      body: JSON.stringify({
        teamId,
        startDate: String(startDate),
        endDate: String(endDate),
        page,
        pageSize,
      }),
    }));

    if (!res.ok) {
      apiLog(`get-filtered-usage-events failed: ${res.status}`);
      complete = false;
      break;
    }

    const data = await res.json();
    const dataRecord = asRecord(data) ?? {};
    const events: unknown[] = Array.isArray(dataRecord.usageEventsDisplay) ? dataRecord.usageEventsDisplay : [];

    if (page === 1) {
      apiLog(`Total usage events available: ${dataRecord.totalUsageEventsCount ?? "unknown"}`);
    }

    for (const event of events) {
      const parsed = parseUsageEvent(event);
      if (parsed) allEvents.push(parsed);
    }

    if (events.length < pageSize) break;
    page++;
  }

  if (page > maxPages) {
    complete = false;
    apiLog(`Stopped usage events fetch after ${maxPages} page(s)`);
  }

  apiLog(`Fetched ${allEvents.length} usage events across ${Math.min(page, maxPages)} page(s)`);
  return { events: allEvents.map(normalizeUsageEventRequests), complete };
}
