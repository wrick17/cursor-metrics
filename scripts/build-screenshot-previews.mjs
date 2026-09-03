import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboardState } from "../src/dashboard-state.ts";
import { renderDashboardHtml } from "../src/dashboard/dashboard-html.ts";
import { buildUsageOverviewMarkdown } from "../src/tooltip.ts";

const progressBarHtml = (ratio) => {
  const pct = Math.max(4, Math.round(Math.min(Math.max(ratio, 0), 1) * 100));
  return `<span class="bar-track"><span class="bar bar-w-${pct}"></span></span>`;
};
const summaryDividerHtml = () => '<span class="divider"></span>';

/** VS Code tooltip HTML uses legacy table attrs; modernize only for the static screenshot preview. */
function modernizeTooltipPreviewHtml(html) {
  return html
    .replace(/ width="18%"/g, ' class="col-label"')
    .replace(/ width="2%"/g, ' class="col-divider"')
    .replace(/ width="[^"]*"/g, "")
    .replace(/ cellspacing="[^"]*"/g, "")
    .replace(/ cellpadding="[^"]*"/g, "")
    .replace(/ valign="[^"]*"/g, "")
    .replace(/ align="[^"]*"/g, "")
    .replace(/<table([^>]*)>/g, "<table$1><tbody>")
    .replace(/<\/table>/g, "</tbody></table>");
}

const barWidthCss = Array.from({ length: 100 }, (_, i) => `.bar-w-${i + 1} { width: ${i + 1}%; }`).join("\n    ");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "media", "dashboard");
mkdirSync(outDir, { recursive: true });

const now = Date.UTC(2026, 6, 14, 10, 30, 0);
const resetsAt = "2026-08-02T15:37:46.000Z";

const events = [];
for (let day = 0; day < 12; day++) {
  const dayStart = Date.UTC(2026, 6, 2 + day, 14, 0, 0);
  events.push(
    {
      timestamp: dayStart,
      model: "default",
      kind: "Included",
      totalTokens: 820_000 + day * 12_000,
      requests: 3,
      spendCents: 180 + day * 8,
      maxMode: false,
      inputTokens: 500_000,
      outputTokens: 300_000,
      cacheWriteTokens: 10_000,
      cacheReadTokens: 10_000,
      tokenCostCents: 170,
      cursorTokenFee: 10,
      isTokenBasedCall: true,
      isHeadless: false,
      isChargeable: true,
      conversationId: "conv-auto",
    },
    {
      timestamp: dayStart + 3_600_000,
      model: "claude-4.6-sonnet",
      kind: "Included",
      totalTokens: 210_000 + day * 4_000,
      requests: 1,
      spendCents: 95,
      maxMode: false,
      inputTokens: 120_000,
      outputTokens: 80_000,
      cacheWriteTokens: 5_000,
      cacheReadTokens: 5_000,
      tokenCostCents: 90,
      cursorTokenFee: 5,
      isTokenBasedCall: true,
      isHeadless: false,
      isChargeable: true,
      conversationId: "conv-api",
    },
    {
      timestamp: dayStart + 7_200_000,
      model: "gpt-5.4",
      kind: "On-Demand",
      totalTokens: 45_000,
      requests: 1,
      spendCents: 320,
      maxMode: false,
      inputTokens: 20_000,
      outputTokens: 22_000,
      cacheWriteTokens: 2_000,
      cacheReadTokens: 1_000,
      tokenCostCents: 300,
      cursorTokenFee: 20,
      isTokenBasedCall: true,
      isHeadless: false,
      isChargeable: true,
      conversationId: null,
    },
  );
}

const data = {
  includedRequests: { used: 500, limit: 500 },
  onDemand: { state: "limited", onDemandEnabled: true, spendDollars: 12.5, limitDollars: 200 },
  poolUsage: { autoPercentUsed: 61.4, apiPercentUsed: 38.2, totalPercentUsed: 49.8 },
  resetsAt,
  planInfo: {
    tier: "Teams",
    accountType: "team",
    planKind: "teams",
    displayName: "Cursor Teams",
    priceLabel: "40 € / mese",
  },
};

const state = buildDashboardState(
  data,
  events,
  [],
  false,
  null,
  now,
  true,
  { "conv-auto": "Refactor auth module", "conv-api": "Pricing dashboard QA" },
  1284,
);

const uiPreferences = {
  range: "billingCycle",
  usageFilter: "all",
  metric: "tokens",
  pricingPinnedIds: ["auto", "claude-4.6-sonnet", "gpt-5.4"],
};

const screenshotTab = process.env.SCREENSHOT_TAB || "usage";

const persistedWebview = {
  locale: "it",
  currency: "eur",
  range: "billingCycle",
  usageFilter: "all",
  metric: "tokens",
  mainTab: screenshotTab,
  pricingPinnedIds: uiPreferences.pricingPinnedIds,
  pricingSortKey: "displayName",
  pricingSortOrder: "asc",
  pricingExpandedId: "claude-4.6-sonnet",
};

const mockWebview = {
  cspSource: "'self'",
  asWebviewUri: (uri) => ({ toString: () => String(uri).replace(/\\/g, "/") }),
};

const shell = renderDashboardHtml(mockWebview, {
  cssUri: "dashboard.css",
  jsUri: "dashboard.js",
  chartUri: "chart.umd.js",
}, "screenshot-nonce");

function buildPreviewHtml(tab) {
  const webviewState = { ...persistedWebview, mainTab: tab };
  const inject = `<script nonce="screenshot-nonce">
  document.documentElement.classList.add("screenshot-preview");
  window.__SCREENSHOT_TAB__ = ${JSON.stringify(tab)};
  window.acquireVsCodeApi = () => ({
    getState: () => (${JSON.stringify(webviewState)}),
    setState: () => {},
    postMessage: (msg) => {
      if (msg?.type === "ready") {
        window.postMessage({ type: "uiPreferences", preferences: ${JSON.stringify(uiPreferences)} }, "*");
        window.postMessage({ type: "init", locale: "it" }, "*");
        window.postMessage({ type: "initCurrency", currency: "eur" }, "*");
        window.postMessage({ type: "state", state: ${JSON.stringify(state)}, locale: "it", currency: "eur" }, "*");
        setTimeout(() => {
          const tab = window.__SCREENSHOT_TAB__;
          const btn = document.querySelector('.dashboard-tab[data-main-tab="' + tab + '"]');
          if (btn && !btn.classList.contains("active")) btn.click();
          if (tab === "pricing") {
            document.querySelector('[data-expand-model="claude-4.6-sonnet"]')?.click();
          }
          document.querySelectorAll('[id^="section-body-"]').forEach((el) => el.classList.remove("hidden"));
          const panel = document.getElementById("tab-panel-" + tab);
          panel?.scrollIntoView({ block: "start" });
          if (tab === "usage") {
            document.getElementById("section-body-usage")?.scrollIntoView({ block: "start" });
          }
        }, 1200);
        setTimeout(() => {
          if (typeof window.Chart !== "undefined") {
            window.dispatchEvent(new Event("resize"));
          }
        }, 900);
      }
    },
  });
</script>`;

  return shell
    .replace('<html lang="en">', '<html lang="it" class="screenshot-preview">')
    .replace(
      '  <script nonce="screenshot-nonce" src="chart.umd.js"></script>',
      `  ${inject}\n  <script nonce="screenshot-nonce" src="chart.umd.js"></script>`,
    );
}

for (const tab of ["usage", "pools", "pricing", "activity"]) {
  writeFileSync(path.join(outDir, `screenshot-preview-${tab}.html`), buildPreviewHtml(tab));
}
writeFileSync(path.join(outDir, "screenshot-preview.html"), buildPreviewHtml("usage"));

const tooltipMd = buildUsageOverviewMarkdown(
  data,
  { html: progressBarHtml, markdown: () => "", divider: summaryDividerHtml },
  "it",
  now,
  events,
  "eur",
  false,
);

const tooltipBody = modernizeTooltipPreviewHtml(
  tooltipMd.replace(/<divider \/>/g, '<span class="divider"></span>'),
);

const tooltipHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Cursor Usage Tooltip Preview</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .status-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 22px;
      background: #007acc;
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 10px;
      font-size: 12px;
    }
    .tooltip {
      width: 420px;
      background: #252526;
      color: #cccccc;
      border: 1px solid #454545;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.45;
    }
    .tooltip table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    .tooltip .col-label { width: 18%; }
    .tooltip .col-divider { width: 2%; vertical-align: top; }
    .tooltip sub { color: #9d9d9d; font-size: 11px; }
    .tooltip strong { color: #fff; font-weight: 600; }
    .tooltip td, .tooltip th { padding: 2px 4px; vertical-align: middle; }
    .bar-track { display: inline-block; width: 120px; height: 6px; background: #3c3c3c; border-radius: 999px; overflow: hidden; vertical-align: middle; }
    .bar { display: block; height: 100%; background: #007acc; border-radius: 999px; }
    ${barWidthCss}
    .divider { display: inline-block; width: 1px; height: 48px; background: #454545; }
  </style>
</head>
<body>
  <div class="tooltip">${tooltipBody}</div>
  <div class="status-bar">61,4% Auto, 38,2% API, 11,50 €</div>
</body>
</html>`;

writeFileSync(path.join(outDir, "screenshot-tooltip.html"), tooltipHtml);
console.log("Screenshot previews written to media/dashboard/");
