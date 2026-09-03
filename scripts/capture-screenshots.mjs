import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = path.join(root, "media", "dashboard");
const mediaDir = path.join(root, "media");

mkdirSync(dashboardDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

console.log("Building extension + screenshot previews...");
spawnSync("bun", ["run", "build"], { cwd: root, stdio: "inherit" });
const buildPreview = spawnSync("bun", ["scripts/build-screenshot-previews.mjs"], { cwd: root, stdio: "inherit" });
if (buildPreview.status !== 0) process.exit(buildPreview.status ?? 1);

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = urlPath === "/" ? "/screenshot-preview-usage.html" : urlPath;
  const filePath = path.join(dashboardDir, rel.replace(/^\//, ""));
  import("node:fs/promises")
    .then((fs) => fs.readFile(filePath))
    .then((data) => {
      const ext = path.extname(filePath);
      const type =
        ext === ".html" ? "text/html" :
        ext === ".js" ? "text/javascript" :
        ext === ".css" ? "text/css" :
        "application/octet-stream";
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    })
    .catch(() => {
      res.writeHead(404);
      res.end("Not found");
    });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

const shots = [
  {
    path: "/screenshot-preview-usage.html",
    out: "extensions-dashboard-usage.png",
    ready: () => {
      const cards = document.querySelectorAll("#summary-cards .card .card-value");
      const chart = document.getElementById("usage-chart");
      return cards.length >= 2 && chart?.getContext("2d");
    },
    scroll: () => document.getElementById("section-body-usage")?.scrollIntoView({ block: "start" }),
  },
  {
    path: "/screenshot-preview-pools.html",
    out: "extensions-dashboard-pools.png",
    ready: () => {
      const panel = document.getElementById("tab-panel-pools");
      return !panel?.classList.contains("hidden") && document.getElementById("pool-chart")?.getContext("2d");
    },
    scroll: () => document.getElementById("section-body-pool")?.scrollIntoView({ block: "start" }),
  },
  {
    path: "/screenshot-preview-pricing.html",
    out: "extensions-dashboard-pricing.png",
    ready: () => {
      const rows = document.querySelectorAll("#pricing-table tbody tr");
      const expanded = document.querySelector('[data-expand-model="claude-4.6-sonnet"][aria-expanded="true"], [data-expand-model="claude-4.6-sonnet"].expanded');
      return rows.length >= 3 && !document.getElementById("tab-panel-pricing")?.classList.contains("hidden");
    },
    scroll: () => document.getElementById("section-body-pricing")?.scrollIntoView({ block: "start" }),
  },
  {
    path: "/screenshot-preview-activity.html",
    out: "extensions-dashboard-activity.png",
    ready: () => document.querySelectorAll("#events-table tbody tr").length >= 5,
    scroll: () => document.getElementById("events-panel")?.scrollIntoView({ block: "start" }),
  },
  {
    path: "/screenshot-tooltip.html",
    out: "extensions-tooltip.png",
    ready: () => document.querySelector(".tooltip table")?.rows.length >= 2,
  },
];

const browser = await puppeteer.launch({ headless: true, defaultViewport: { width: 1100, height: 900 } });
const page = await browser.newPage();

for (const shot of shots) {
  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: "networkidle0", timeout: 30_000 });
  await page.waitForFunction(shot.ready, { timeout: 20_000 });
  if (shot.scroll) {
    await page.evaluate(shot.scroll);
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.screenshot({
    path: path.join(mediaDir, shot.out),
    fullPage: false,
  });
  console.log("Wrote", shot.out);
}

await browser.close();
server.close();

copyFileSync(
  path.join(mediaDir, "extensions-dashboard-usage.png"),
  path.join(mediaDir, "extensions-dashboard.png"),
);
console.log("Updated extensions-dashboard.png");
