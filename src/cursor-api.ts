import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type UsagePayload = {
  includedRequests: { used: number; limit: number };
  onDemand: { spendDollars: number; limitDollars: number };
  resetsAt: string | null;
};

export type UsageEvent = {
  timestamp: number;
  model: string;
  kind: string;
  totalTokens: number;
  requests: number;
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

type SetupCache = {
  isTeamMember: boolean;
  teamId?: number;
  maxRequestUsage: number;
};

let cachedSetup: SetupCache | null = null;

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
  const gpt4 = usage?.["gpt-4"] ?? {};

  cachedSetup = {
    isTeamMember: !!(stripe?.isTeamMember && stripe.teamId),
    teamId: stripe?.teamId,
    maxRequestUsage: gpt4.maxRequestUsage ?? gpt4.numRequests ?? 0,
  };

  log(`Setup cached: team=${cachedSetup.isTeamMember}, teamId=${cachedSetup.teamId}, maxReq=${cachedSetup.maxRequestUsage}`);
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
  return fetchSoloUsage(auth, headers);
}

async function fetchTeamUsage(
  auth: AuthInfo,
  headers: ReturnType<typeof cursorHeaders>,
  setup: SetupCache,
): Promise<UsagePayload | null> {
  const res = await fetch("https://cursor.com/api/dashboard/get-team-spend", {
    method: "POST",
    headers,
    body: JSON.stringify({ teamId: setup.teamId }),
  });

  if (!res.ok) {
    log(`get-team-spend failed: ${res.status}`);
    return null;
  }

  const data = await res.json();
  const members: any[] = data.teamMemberSpend ?? [];
  const me = members.find((m: any) => m.email === auth.email || String(m.userId) === auth.userId);

  if (!me) {
    log(`Could not find current user in team spend (email=${auth.email}, userId=${auth.userId})`);
    return null;
  }

  const resetsAt = data.nextCycleStart
    ? new Date(Number(data.nextCycleStart)).toISOString()
    : null;

  const result: UsagePayload = {
    includedRequests: {
      used: me.fastPremiumRequests ?? 0,
      limit: setup.maxRequestUsage,
    },
    onDemand: {
      spendDollars: (me.spendCents ?? 0) / 100,
      limitDollars: me.hardLimitOverrideDollars ?? 0,
    },
    resetsAt,
  };

  log(`Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs, $${result.onDemand.spendDollars}/$${result.onDemand.limitDollars}`);
  return result;
}

async function fetchSoloUsage(
  auth: AuthInfo,
  headers: ReturnType<typeof cursorHeaders>,
): Promise<UsagePayload | null> {
  const res = await fetch(`https://cursor.com/api/usage?user=${auth.userId}`, { headers });

  if (!res.ok) {
    log(`Usage API failed: ${res.status}`);
    return null;
  }

  const usage = await res.json();
  const gpt4 = usage["gpt-4"] ?? {};
  const resetsAt = usage.startOfMonth ? nextMonth(usage.startOfMonth) : null;

  const result: UsagePayload = {
    includedRequests: {
      used: gpt4.numRequests ?? 0,
      limit: gpt4.maxRequestUsage ?? 0,
    },
    onDemand: { spendDollars: 0, limitDollars: 0 },
    resetsAt,
  };

  log(`Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs`);
  return result;
}

function parseEventKind(kind: string): string {
  if (kind === "USAGE_EVENT_KIND_USAGE_BASED") return "On-Demand";
  if (kind === "USAGE_EVENT_KIND_ERRORED_NOT_CHARGED") return "Errored";
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
  const startDate = endDate - 30 * 86_400_000;
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
        (tok.inputTokens ?? 0) +
        (tok.outputTokens ?? 0) +
        (tok.cacheWriteTokens ?? 0) +
        (tok.cacheReadTokens ?? 0);

      allEvents.push({
        timestamp: e.timestamp ?? 0,
        model: e.model ?? "unknown",
        kind: parseEventKind(e.kind ?? ""),
        totalTokens,
        requests: e.numRequests ?? 1,
      });
    }

    if (events.length < pageSize) break;
    page++;
  }

  log(`Fetched ${allEvents.length} usage events across ${page} page(s)`);
  return allEvents;
}
