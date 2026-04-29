import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type UsagePayload = {
  includedRequests: { used: number; limit: number };
  onDemand: {
    state: "disabled" | "limited" | "unlimited";
    spendDollars: number;
    limitDollars: number | null;
  };
  resetsAt: string | null;
};

export type UsageEvent = {
  timestamp: number;
  model: string;
  kind: string;
  totalTokens: number;
  requests: number;
  spendCents: number;
  maxMode: boolean;
};

export type DailySpendRow = {
  day: number;
  category: string;
  spendCents: number;
  totalTokens: number;
};

type Logger = (msg: string) => void;

let log: Logger = () => {};

export function configure(opts: { logger: Logger }) {
  log = opts.logger;
}

function getDbPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "Cursor/User/globalStorage/state.vscdb");
    default:
      return join(homedir(), ".config/Cursor/User/globalStorage/state.vscdb");
  }
}

type AuthInfo = { userId: string; sessionToken: string; email: string | null };

let cachedAuth: { info: AuthInfo | null; ts: number } = { info: null, ts: 0 };
const AUTH_CACHE_TTL = 10_000;

function getCursorToken(): AuthInfo | null {
  if (cachedAuth.info && Date.now() - cachedAuth.ts < AUTH_CACHE_TTL) {
    log("Using cached auth token");
    return cachedAuth.info;
  }

  const dbPath = getDbPath();
  log(`DB path: ${dbPath}`);

  if (!existsSync(dbPath)) {
    log("Database file does not exist");
    return null;
  }

  const run = (query: string) =>
    execSync(`sqlite3 "${dbPath}" "${query}"`, { encoding: "utf-8", timeout: 10_000 }).trim();

  const jwt = run("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'");
  if (!jwt) {
    log("No accessToken found in database");
    return null;
  }

  log(`Found JWT token (${jwt.length} chars)`);
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64").toString());
  const userId: string = payload.sub.split("|")[1];
  log(`Parsed userId: ${userId}`);

  let email: string | null = null;
  try {
    email = run("SELECT value FROM ItemTable WHERE key = 'cursorAuth/cachedEmail'") || null;
    log(`Cached email: ${email}`);
  } catch {
    log("Could not read cachedEmail from database");
  }

  const info = { userId, sessionToken: `${userId}%3A%3A${jwt}`, email };
  cachedAuth = { info, ts: Date.now() };
  return info;
}

function cursorHeaders(sessionToken: string) {
  return {
    "Content-Type": "application/json",
    Cookie: `WorkosCursorSessionToken=${sessionToken}`,
    Origin: "https://cursor.com",
    Referer: "https://cursor.com/dashboard",
  } as const;
}

function nextMonth(iso: string): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

type RequestTotals = { used: number; limit: number; source: string };
type NumberWithSource = { value: number; source: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractBucketTotals(bucket: Record<string, unknown>, source: string): RequestTotals | null {
  const used =
    toNumber(bucket.numRequests) ??
    toNumber(bucket.usedRequests) ??
    toNumber(bucket.requestsUsed) ??
    toNumber(bucket.includedRequestsUsed);

  const limit =
    toNumber(bucket.maxRequestUsage) ??
    toNumber(bucket.maxRequests) ??
    toNumber(bucket.requestLimit) ??
    toNumber(bucket.includedRequestLimit);

  if (used === null && limit === null) return null;
  return { used: used ?? 0, limit: limit ?? 0, source };
}

function pickBestTotals(candidates: RequestTotals[]): RequestTotals | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aScore = Number(a.limit > 0) + Number(a.used > 0);
    const bScore = Number(b.limit > 0) + Number(b.used > 0);
    if (aScore !== bScore) return bScore - aScore;
    if (a.limit !== b.limit) return b.limit - a.limit;
    return b.used - a.used;
  })[0];
}

function extractUsageTotals(usageRaw: unknown): RequestTotals {
  const usage = asRecord(usageRaw);
  if (!usage) {
    log("Usage payload is not an object; defaulting totals to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  const keys = Object.keys(usage);
  log(`Usage keys: ${keys.length > 0 ? keys.join(", ") : "(none)"}`);

  const gpt4 = asRecord(usage["gpt-4"]);
  const gpt4Totals = gpt4 ? extractBucketTotals(gpt4, "gpt-4") : null;

  const dynamicCandidates: RequestTotals[] = [];
  const rootTotals = extractBucketTotals(usage, "root");
  if (rootTotals) dynamicCandidates.push(rootTotals);

  for (const [key, value] of Object.entries(usage)) {
    if (key === "gpt-4") continue;
    const bucket = asRecord(value);
    if (!bucket) continue;
    const totals = extractBucketTotals(bucket, key);
    if (totals) dynamicCandidates.push(totals);
  }

  const bestDynamic = pickBestTotals(dynamicCandidates);
  if (!gpt4Totals && !bestDynamic) {
    log("Could not parse usage totals from payload; defaulting to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  if (gpt4Totals && !bestDynamic) {
    log(`Using usage bucket: ${gpt4Totals.source} (${gpt4Totals.used}/${gpt4Totals.limit})`);
    return gpt4Totals;
  }

  if (!gpt4Totals && bestDynamic) {
    log(`Using usage bucket: ${bestDynamic.source} (${bestDynamic.used}/${bestDynamic.limit})`);
    return bestDynamic;
  }

  if (gpt4Totals && bestDynamic) {
    const chooseDynamic =
      bestDynamic.limit > gpt4Totals.limit ||
      (bestDynamic.limit === gpt4Totals.limit && bestDynamic.used > gpt4Totals.used);

    const selected = chooseDynamic ? bestDynamic : gpt4Totals;
    log(`Using usage bucket: ${selected.source} (${selected.used}/${selected.limit})`);
    return selected;
  }

  return { used: 0, limit: 0, source: "none" };
}

function pickNumber(record: Record<string, unknown>, fields: string[]): NumberWithSource | null {
  for (const field of fields) {
    const value = toNumber(record[field]);
    if (value !== null) {
      return { value, source: field };
    }
  }
  return null;
}

function extractTeamUsedRequests(member: Record<string, unknown>): NumberWithSource {
  return (
    pickNumber(member, [
      "includedRequestsUsed",
      "numRequests",
      "requestsUsed",
      "fastPremiumRequests",
    ]) ?? { value: 0, source: "fallback:0" }
  );
}

function extractTeamRequestLimit(
  member: Record<string, unknown>,
  fallbackLimit: number,
): NumberWithSource {
  return (
    pickNumber(member, ["includedRequestLimit", "maxRequestUsage"]) ?? {
      value: fallbackLimit,
      source: "setup.maxRequestUsage",
    }
  );
}

type SetupCache = {
  isTeamMember: boolean;
  teamId?: number;
  maxRequestUsage: number;
  onDemandEnabled: boolean;
};

let cachedSetup: SetupCache | null = null;

export function isTeamMemberCached(): boolean {
  return cachedSetup?.isTeamMember ?? false;
}

async function ensureSetup(
  userId: string,
  headers: ReturnType<typeof cursorHeaders>,
): Promise<SetupCache | null> {
  if (cachedSetup) return cachedSetup;

  log("Running one-time setup (stripe + usage)...");
  const [stripeRes, usageRes] = await Promise.all([
    fetch("https://cursor.com/api/auth/stripe", { headers }),
    fetch(`https://cursor.com/api/usage?user=${userId}`, { headers }),
  ]);

  log(`Setup: Stripe ${stripeRes.status}, Usage ${usageRes.status}`);

  const stripe = stripeRes.ok ? await stripeRes.json() : null;
  const usage = usageRes.ok ? await usageRes.json() : null;
  const totals = extractUsageTotals(usage);

  cachedSetup = {
    isTeamMember: !!(stripe?.isTeamMember && stripe.teamId),
    teamId: stripe?.teamId,
    maxRequestUsage: totals.limit > 0 ? totals.limit : totals.used,
    onDemandEnabled: Boolean(stripe?.isOnBillableAuto),
  };

  log(
    `Setup cached: team=${cachedSetup.isTeamMember}, teamId=${cachedSetup.teamId}, maxReq=${cachedSetup.maxRequestUsage}, onDemandEnabled=${cachedSetup.onDemandEnabled}`,
  );
  return cachedSetup;
}

export async function fetchUsageData(): Promise<UsagePayload | null> {
  log("--- Fetching usage data ---");

  const auth = getCursorToken();
  if (!auth) {
    log("Failed to get auth token");
    return null;
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, headers);
  if (!setup) {
    log("Setup failed");
    return null;
  }

  if (setup.isTeamMember) {
    return fetchTeamUsage(auth, headers, setup);
  }
  return fetchSoloUsage(auth, headers, setup);
}

async function fetchTeamUsage(
  auth: AuthInfo,
  headers: ReturnType<typeof cursorHeaders>,
  setup: SetupCache,
): Promise<UsagePayload | null> {
  const [teamSpendRes, usageRes] = await Promise.all([
    fetch("https://cursor.com/api/dashboard/get-team-spend", {
      method: "POST",
      headers,
      body: JSON.stringify({ teamId: setup.teamId }),
    }),
    fetch(`https://cursor.com/api/usage?user=${auth.userId}`, { headers }),
  ]);

  if (!teamSpendRes.ok) {
    log(`get-team-spend failed: ${teamSpendRes.status}`);
    return null;
  }

  let usageTotals: RequestTotals | null = null;
  if (usageRes.ok) {
    const usage = await usageRes.json();
    usageTotals = extractUsageTotals(usage);
  } else {
    log(`Usage API failed in team mode: ${usageRes.status}`);
  }

  const data = await teamSpendRes.json();
  const members: any[] = data.teamMemberSpend ?? [];
  const me = members.find((m: any) => m.email === auth.email || String(m.userId) === auth.userId);

  if (!me) {
    log(`Could not find current user in team spend (email=${auth.email}, userId=${auth.userId})`);
    return null;
  }

  const resetsAt = data.nextCycleStart
    ? new Date(Number(data.nextCycleStart)).toISOString()
    : null;

  const meRecord = asRecord(me) ?? {};
  log(`Team member keys: ${Object.keys(meRecord).join(", ") || "(none)"}`);

  const memberUsed = extractTeamUsedRequests(meRecord);
  const memberLimit = extractTeamRequestLimit(meRecord, setup.maxRequestUsage);

  const used = usageTotals && usageTotals.used > 0 ? usageTotals.used : memberUsed.value;
  const limit = usageTotals && usageTotals.limit > 0 ? usageTotals.limit : memberLimit.value;
  const usedSource = usageTotals && usageTotals.used > 0
    ? `usage.${usageTotals.source}.used`
    : `member.${memberUsed.source}`;
  const limitSource = usageTotals && usageTotals.limit > 0
    ? `usage.${usageTotals.source}.limit`
    : `member.${memberLimit.source}`;
  log(`Team request source: used=${usedSource}, limit=${limitSource}`);

  const spendCents = toNumber(meRecord.spendCents) ?? 0;
  const spendDollars = spendCents / 100;
  const hardLimit = toNumber(meRecord.hardLimitOverrideDollars);
  const onDemandState = !setup.onDemandEnabled
    ? "disabled"
    : hardLimit !== null && hardLimit > 0
      ? "limited"
      : "unlimited";
  const limitDollars = onDemandState === "limited" ? hardLimit : null;
  log(`On-demand state: ${onDemandState}`);

  const result: UsagePayload = {
    includedRequests: {
      used,
      limit,
    },
    onDemand: {
      state: onDemandState,
      spendDollars,
      limitDollars,
    },
    resetsAt,
  };

  const spendLimitLabel = result.onDemand.state === "unlimited"
    ? "∞"
    : result.onDemand.state === "disabled"
      ? "hidden"
      : `$${(result.onDemand.limitDollars ?? 0).toFixed(2)}`;
  log(
    `Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs, $${result.onDemand.spendDollars.toFixed(2)}/${spendLimitLabel}`,
  );
  return result;
}

async function fetchSoloUsage(
  auth: AuthInfo,
  headers: ReturnType<typeof cursorHeaders>,
  setup: SetupCache,
): Promise<UsagePayload | null> {
  const res = await fetch(`https://cursor.com/api/usage?user=${auth.userId}`, { headers });

  if (!res.ok) {
    log(`Usage API failed: ${res.status}`);
    return null;
  }

  const usage = await res.json();
  const totals = extractUsageTotals(usage);
  const resetsAt = usage.startOfMonth ? nextMonth(usage.startOfMonth) : null;

  const result: UsagePayload = {
    includedRequests: {
      used: totals.used,
      limit: totals.limit,
    },
    onDemand: setup.onDemandEnabled
      ? { state: "limited", spendDollars: 0, limitDollars: 0 }
      : { state: "disabled", spendDollars: 0, limitDollars: null },
    resetsAt,
  };

  log(`Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs`);
  return result;
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
  headers: ReturnType<typeof cursorHeaders>,
  setup: SetupCache,
): Promise<number | null> {
  const directUserId = toNumber(auth.userId);
  if (directUserId !== null) {
    return directUserId;
  }

  if (!setup.isTeamMember || !setup.teamId) {
    return null;
  }

  const res = await fetch("https://cursor.com/api/dashboard/get-team-spend", {
    method: "POST",
    headers,
    body: JSON.stringify({ teamId: setup.teamId }),
  });
  if (!res.ok) {
    log(`get-team-spend failed while resolving dashboard user id: ${res.status}`);
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

  log(`Could not resolve dashboard user id from team spend (email=${auth.email}, userId=${auth.userId})`);
  return null;
}

export async function fetchDailySpendByCategory(): Promise<DailySpendRow[]> {
  log("--- Fetching daily spend by category ---");

  const auth = getCursorToken();
  if (!auth) {
    log("Failed to get auth token for daily spend");
    return [];
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, headers);
  if (!setup?.isTeamMember || !setup.teamId) {
    log("Skipping daily spend fetch: team setup unavailable");
    return [];
  }

  const dashboardUserId = await resolveDashboardUserId(auth, headers, setup);
  if (dashboardUserId === null) {
    log("Skipping daily spend fetch: dashboard user id unavailable");
    return [];
  }

  const periodEndMs = Date.now();
  const periodStartMs = periodEndMs - 31 * 86_400_000;
  const res = await fetch("https://cursor.com/api/dashboard/get-daily-spend-by-category", {
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
  });

  if (!res.ok) {
    log(`get-daily-spend-by-category failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const rows: unknown[] = Array.isArray(data.dailySpend) ? data.dailySpend : [];
  const parsedRows: DailySpendRow[] = [];
  for (const row of rows) {
    const parsed = parseDailySpendRow(row);
    if (parsed) parsedRows.push(parsed);
  }
  log(`Fetched ${parsedRows.length} daily spend rows`);
  return parsedRows;
}

function parseEventKind(kind: string): string {
  if (kind === "USAGE_EVENT_KIND_USAGE_BASED") return "On-Demand";
  if (kind === "USAGE_EVENT_KIND_ERRORED_NOT_CHARGED") return "Errored";
  if (kind === "USAGE_EVENT_KIND_ABORTED_NOT_CHARGED") return "Aborted";
  return "Included";
}

export async function fetchUsageEvents(): Promise<UsageEvent[]> {
  log("--- Fetching usage events ---");

  const auth = getCursorToken();
  if (!auth) {
    log("Failed to get auth token for events");
    return [];
  }

  const headers = cursorHeaders(auth.sessionToken);
  const setup = await ensureSetup(auth.userId, headers);
  const teamId = setup?.teamId ?? 0;

  const endDate = Date.now();
  const startDate = endDate - 31 * 86_400_000;
  const pageSize = 500;
  let page = 1;
  const allEvents: UsageEvent[] = [];

  while (true) {
    const res = await fetch("https://cursor.com/api/dashboard/get-filtered-usage-events", {
      method: "POST",
      headers,
      body: JSON.stringify({
        teamId,
        startDate: String(startDate),
        endDate: String(endDate),
        page,
        pageSize,
      }),
    });

    if (!res.ok) {
      log(`get-filtered-usage-events failed: ${res.status}`);
      break;
    }

    const data = await res.json();
    const events: any[] = data.usageEventsDisplay ?? [];

    if (page === 1) {
      log(`Total usage events available: ${data.totalUsageEventsCount ?? "unknown"}`);
    }

    for (const e of events) {
      const tok = e.tokenUsage ?? {};
      const totalTokens =
        (toNumber(tok.inputTokens) ?? 0) +
        (toNumber(tok.outputTokens) ?? 0) +
        (toNumber(tok.cacheWriteTokens) ?? 0) +
        (toNumber(tok.cacheReadTokens) ?? 0);

      const requests = toNumber(e.requestsCosts) ?? toNumber(e.numRequests) ?? 1;
      const spendCents = toNumber(e.chargedCents) ?? 0;

      allEvents.push({
        timestamp: toNumber(e.timestamp) ?? 0,
        model: e.model ?? "unknown",
        kind: parseEventKind(e.kind ?? ""),
        totalTokens,
        requests,
        spendCents,
        maxMode: Boolean(e.maxMode),
      });
    }

    if (events.length < pageSize) break;
    page++;
  }

  log(`Fetched ${allEvents.length} usage events across ${page} page(s)`);
  return allEvents;
}
