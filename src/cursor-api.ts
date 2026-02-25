import { execSync } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type UsagePayload = {
  includedRequests: { used: number; limit: number };
  onDemand: { spendDollars: number; limitDollars: number };
  resetsAt: string | null;
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

function getCursorToken(): { userId: string; sessionToken: string } | null {
  const dbPath = getDbPath();
  log(`DB path: ${dbPath}`);

  if (!existsSync(dbPath)) {
    log("Database file does not exist");
    return null;
  }

  const query = "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'";
  const jwt = execSync(`sqlite3 "${dbPath}" "${query}"`, {
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();

  if (!jwt) {
    log("No accessToken found in database");
    return null;
  }

  log(`Found JWT token (${jwt.length} chars)`);
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64").toString());
  const userId: string = payload.sub.split("|")[1];
  log(`Parsed userId: ${userId}`);

  return { userId, sessionToken: `${userId}%3A%3A${jwt}` };
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

export async function fetchUsageData(): Promise<UsagePayload | null> {
  log("--- Fetching usage data ---");

  const auth = getCursorToken();
  if (!auth) {
    log("Failed to get auth token");
    return null;
  }

  const headers = cursorHeaders(auth.sessionToken);
  const post = (url: string, body: Record<string, unknown> = {}) =>
    fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  const [usageRes, stripeRes, meRes] = await Promise.all([
    fetch(`https://cursor.com/api/usage?user=${auth.userId}`, { headers }),
    fetch("https://cursor.com/api/auth/stripe", { headers }),
    fetch("https://cursor.com/api/auth/me", { headers }),
  ]);

  log(`Usage API: ${usageRes.status}, Stripe: ${stripeRes.status}, Me: ${meRes.status}`);

  if (!usageRes.ok) {
    log(`Usage API failed: ${usageRes.status} ${await usageRes.text().catch(() => "")}`);
    return null;
  }

  const usage = await usageRes.json();
  const gpt4 = usage["gpt-4"] ?? {};
  const resetsAt = usage.startOfMonth ? nextMonth(usage.startOfMonth) : null;

  let spendDollars = 0;
  let limitDollars = 200;

  const stripe = stripeRes.ok ? await stripeRes.json() : null;
  const me = meRes.ok ? await meRes.json() : null;

  if (stripe?.isTeamMember && stripe.teamId) {
    log(`Team member detected, teamId: ${stripe.teamId}`);
    const [spendRes, limitRes] = await Promise.all([
      post("https://cursor.com/api/dashboard/get-team-spend", { teamId: stripe.teamId }),
      post("https://cursor.com/api/dashboard/get-hard-limit", { teamId: stripe.teamId }),
    ]);

    if (spendRes.ok) {
      const { teamMemberSpend } = await spendRes.json();
      const mySpend = teamMemberSpend?.find(
        (m: any) => m.email === me?.email || m.userId === me?.id,
      );
      if (mySpend) {
        spendDollars = (mySpend.spendCents ?? 0) / 100;
        limitDollars = mySpend.hardLimitOverrideDollars ?? limitDollars;
      }
    }

    if (limitRes.ok) {
      const limitData = await limitRes.json();
      limitDollars = limitData.hardLimitPerUser ?? limitDollars;
    }
  }

  const result: UsagePayload = {
    includedRequests: { used: gpt4.numRequests ?? 0, limit: gpt4.maxRequestUsage ?? 500 },
    onDemand: { spendDollars, limitDollars },
    resetsAt,
  };
  log(`Result: ${result.includedRequests.used}/${result.includedRequests.limit} reqs, $${result.onDemand.spendDollars}/$${result.onDemand.limitDollars}`);
  return result;
}
