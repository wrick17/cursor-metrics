/**
 * Compare per-model token totals from usage events vs daily spend API.
 * Run: npx tsx scripts/compare-token-sources.ts
 */
import {
  configure,
  eventTokenCount,
  fetchDailySpendByCategory,
  fetchUsageData,
  fetchUsageEvents,
} from "../src/cursor-api";
import {
  aggregateTokensByCategory,
  getDurationCutoff,
} from "../src/model-breakdown";
import { usageEventFingerprint } from "../src/usage-event-fingerprint";
import type { UsageEvent } from "../src/cursor-api-types";

configure({ logger: (msg) => console.log(msg) });

const FOCUS_MODELS = [
  "claude-opus-5-thinking-max",
  "composer-2.5",
  "default",
  "cursor-grok-4.5-high",
];

function formatTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

function aggregateEventTokens(events: UsageEvent[], cutoff: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.timestamp < cutoff) continue;
    totals.set(event.model, (totals.get(event.model) ?? 0) + eventTokenCount(event));
  }
  return totals;
}

function sumMap(map: Map<string, number>): number {
  let total = 0;
  for (const value of map.values()) total += value;
  return total;
}

const now = Date.now();
const data = await fetchUsageData();
const resetsAt = data?.resetsAt ?? null;
const cutoff = getDurationCutoff("billingCycle", resetsAt, now);

console.log("\n=== Billing cycle ===");
console.log(`resetsAt: ${resetsAt ?? "(unknown)"}`);
console.log(`cutoff:   ${new Date(cutoff).toISOString()}`);
console.log(`now:      ${new Date(now).toISOString()}`);

const { events: apiEvents } = await fetchUsageEvents({ lookbackDays: 120, maxPages: 100 });
const dailySpend = await fetchDailySpendByCategory({ resetAtIso: resetsAt });

const apiByModel = aggregateEventTokens(apiEvents, cutoff);
const dailyByModel = aggregateTokensByCategory(dailySpend, "billingCycle", resetsAt, now);

console.log("\n=== Totals (billing cycle) ===");
console.log(`API events:  ${formatTokens(sumMap(apiByModel))} (${apiEvents.length} fetched)`);
console.log(`Daily spend: ${formatTokens(sumMap(dailyByModel))} (${dailySpend.length} rows)`);

console.log("\n=== Per-model comparison ===");
console.log("Model | Events | Daily | Δ%");
const allModels = new Set([
  ...apiByModel.keys(),
  ...dailyByModel.keys(),
  ...FOCUS_MODELS,
]);
const sorted = [...allModels].sort((a, b) => (dailyByModel.get(b) ?? 0) - (dailyByModel.get(a) ?? 0));
for (const model of sorted) {
  const ev = apiByModel.get(model) ?? 0;
  const daily = dailyByModel.get(model) ?? 0;
  if (ev === 0 && daily === 0) continue;
  const delta = daily > 0 ? (((ev - daily) / daily) * 100).toFixed(1) : "—";
  const marker = FOCUS_MODELS.includes(model) ? "*" : " ";
  console.log(
    `${marker}${model.padEnd(32)} | ${formatTokens(ev).padStart(8)} | ${formatTokens(daily).padStart(8)} | ${delta}%`,
  );
}

const fingerprints = new Map<string, number>();
let polluted = 0;
for (const event of apiEvents) {
  if (event.timestamp < cutoff) continue;
  const fp = usageEventFingerprint(event);
  fingerprints.set(fp, (fingerprints.get(fp) ?? 0) + 1);
  const components =
    (event.inputTokens ?? 0) +
    (event.outputTokens ?? 0) +
    (event.cacheWriteTokens ?? 0) +
    (event.cacheReadTokens ?? 0);
  if (components > 0 && event.totalTokens > components * 1.5) polluted += 1;
}

const duplicateEvents = [...fingerprints.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
console.log("\n=== Data quality ===");
console.log(`Duplicate fingerprint rows (in-cycle): ${duplicateEvents}`);
console.log(`Events with totalTokens >> components: ${polluted}`);
