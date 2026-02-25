import { serve } from "bun";
import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";
import index from "./index.html";

const DB_PATH = join(
  homedir(),
  "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
);

function getCursorToken() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db
      .query("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'")
      .get() as { value: string } | null;
    db.close();
    if (!row) return null;

    const jwt = row.value;
    const userId = JSON.parse(atob(jwt.split(".")[1])).sub.split("|")[1];
    return { userId, sessionToken: `${userId}%3A%3A${jwt}` };
  } catch {
    return null;
  }
}

function cursorHeaders(sessionToken: string) {
  return {
    "Content-Type": "application/json",
    Cookie: `WorkosCursorSessionToken=${sessionToken}`,
    Origin: "https://cursor.com",
    Referer: "https://cursor.com/dashboard",
  } as const;
}

function nextMonth(iso: string) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

type UsagePayload = {
  includedRequests: { used: number; limit: number };
  onDemand: { spendDollars: number; limitDollars: number };
  resetsAt: string | null;
};

let cachedData: UsagePayload | null = null;
let cachedError: string | null = null;

async function fetchUsage() {
  const auth = getCursorToken();
  if (!auth) {
    cachedError = "Could not read Cursor auth token";
    return;
  }

  const headers = cursorHeaders(auth.sessionToken);
  const post = (url: string, body = {}) =>
    fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  try {
    const [usageRes, stripeRes, meRes] = await Promise.all([
      fetch(`https://cursor.com/api/usage?user=${auth.userId}`, { headers }),
      fetch("https://cursor.com/api/auth/stripe", { headers }),
      fetch("https://cursor.com/api/auth/me", { headers }),
    ]);

    if (!usageRes.ok) {
      cachedError = `Usage API: ${usageRes.status}`;
      return;
    }

    const usage = await usageRes.json();
    const gpt4 = usage["gpt-4"] ?? {};
    const resetsAt = usage.startOfMonth ? nextMonth(usage.startOfMonth) : null;

    let spendDollars = 0;
    let limitDollars = 200;

    const stripe = stripeRes.ok ? await stripeRes.json() : null;
    const me = meRes.ok ? await meRes.json() : null;

    if (stripe?.isTeamMember && stripe.teamId) {
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

    cachedData = {
      includedRequests: { used: gpt4.numRequests ?? 0, limit: gpt4.maxRequestUsage ?? 500 },
      onDemand: { spendDollars, limitDollars },
      resetsAt,
    };
    cachedError = null;
  } catch (err: any) {
    cachedError = err.message;
  }
}

fetchUsage();
setInterval(fetchUsage, 60_000);

const server = serve({
  port: 5000,
  routes: {
    "/*": index,

    "/api/cursor/usage": {
      GET() {
        if (cachedError && !cachedData) {
          return Response.json({ error: cachedError }, { status: 502 });
        }
        if (!cachedData) {
          return Response.json({ error: "Loading..." }, { status: 503 });
        }
        return Response.json(cachedData);
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
