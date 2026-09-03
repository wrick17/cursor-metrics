import { apiLog } from "./cursor-api-logger";
import type { RequestTotals } from "./cursor-api-types";
import { asRecord, toNumber } from "./cursor-api-utils";

function extractBucketTotals(bucket: Record<string, unknown>, source: string): RequestTotals | null {
  const used =
    toNumber(bucket.numRequests) ??
    toNumber(bucket.usedRequests) ??
    toNumber(bucket.requestsUsed) ??
    toNumber(bucket.includedRequestsUsed) ??
    toNumber(bucket.premiumRequestsUsed) ??
    toNumber(bucket.fastPremiumRequestsUsed);

  const limit =
    toNumber(bucket.maxRequestUsage) ??
    toNumber(bucket.maxRequests) ??
    toNumber(bucket.requestLimit) ??
    toNumber(bucket.includedRequestLimit) ??
    toNumber(bucket.premiumRequestLimit);

  if (used === null && limit === null) return null;
  return { used: used ?? 0, limit: limit ?? 0, source };
}

function pickBestTotals(candidates: RequestTotals[]): RequestTotals | null {
  if (candidates.length === 0) return null;
  const [best] = [...candidates].sort((a, b) => {
    const aScore = Number(a.limit > 0) + Number(a.used > 0);
    const bScore = Number(b.limit > 0) + Number(b.used > 0);
    if (aScore !== bScore) return bScore - aScore;
    if (a.limit !== b.limit) return b.limit - a.limit;
    return b.used - a.used;
  });
  return best ?? null;
}

export function extractUsageTotals(usageRaw: unknown): RequestTotals {
  const usage = asRecord(usageRaw);
  if (!usage) {
    apiLog("Usage payload is not an object; defaulting totals to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  const keys = Object.keys(usage);
  apiLog(`Usage keys: ${keys.length > 0 ? keys.join(", ") : "(none)"}`);

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
    apiLog("Could not parse usage totals from payload; defaulting to 0/0");
    return { used: 0, limit: 0, source: "none" };
  }

  if (gpt4Totals && !bestDynamic) {
    apiLog(`Using usage bucket: ${gpt4Totals.source} (${gpt4Totals.used}/${gpt4Totals.limit})`);
    if (gpt4Totals.used === 0 && gpt4Totals.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return gpt4Totals;
  }

  if (!gpt4Totals && bestDynamic) {
    apiLog(`Using usage bucket: ${bestDynamic.source} (${bestDynamic.used}/${bestDynamic.limit})`);
    if (bestDynamic.used === 0 && bestDynamic.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return bestDynamic;
  }

  if (gpt4Totals && bestDynamic) {
    const chooseDynamic =
      bestDynamic.limit > gpt4Totals.limit ||
      (bestDynamic.limit === gpt4Totals.limit && bestDynamic.used > gpt4Totals.used);

    const selected = chooseDynamic ? bestDynamic : gpt4Totals;
    apiLog(`Using usage bucket: ${selected.source} (${selected.used}/${selected.limit})`);
    if (selected.used === 0 && selected.limit === 0) {
      return { used: 0, limit: 0, source: "none" };
    }
    return selected;
  }

  const chosen = gpt4Totals ?? bestDynamic;
  if (chosen && chosen.used === 0 && chosen.limit === 0) {
    apiLog("Legacy usage buckets are all zero; treating as unparsed");
    return { used: 0, limit: 0, source: "none" };
  }

  return { used: 0, limit: 0, source: "none" };
}
