#!/usr/bin/env bun
import { serve } from "bun";
import { Database } from "bun:sqlite";
import { exec, spawn } from "child_process";
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const args = process.argv.slice(2);

const PID_FILE = join(homedir(), ".cursor-usage.pid");
const LOG_FILE = join(homedir(), ".cursor-usage.log");

if (args.includes("-h") || args.includes("--help")) {
  console.log(`cursor-usage - Cursor IDE usage dashboard

Usage: cursor-usage [options]

Options:
  -p, --port <number>  Port to run the server on (default: 5432)
  -o, --open           Open the dashboard in your browser
  -k, --kill           Stop a running cursor-usage process
      --fg             Run in foreground (don't daemonize)
  -h, --help           Show this help message`);
  process.exit(0);
}

if (args.includes("-k") || args.includes("--kill")) {
  if (!existsSync(PID_FILE)) {
    console.log("No cursor-usage process found");
    process.exit(1);
  }
  const pid = Number(readFileSync(PID_FILE, "utf-8").trim());
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Stopped cursor-usage (pid ${pid})`);
  } catch {
    console.log(`Process ${pid} not running, cleaning up stale PID file`);
  }
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

function parsePort(): number {
  const idx = args.findIndex(a => a === "--port" || a === "-p");
  if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1]);
  return 5432;
}

const shouldOpen = args.includes("--open") || args.includes("-o");
const isDaemon = args.includes("--daemon");
const isForeground = args.includes("--fg");

if (!isDaemon && !isForeground) {
  const port = parsePort();
  const childArgs = [import.meta.filename, "--daemon", "-p", String(port)];
  const out = openSync(LOG_FILE, "a");
  const child = spawn("bun", childArgs, {
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log(`cursor-usage running in background (pid ${child.pid}) on port ${port}`);
  console.log(`Logs: ${LOG_FILE}`);
  if (shouldOpen) exec(`open http://localhost:${port}`);
  process.exit(0);
}

process.on("SIGTERM", () => {
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
});

const index = await import("./index.html").then(m => m.default);

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
  port: parsePort(),
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

if (isForeground && shouldOpen) {
  exec(`open ${server.url}`);
}
