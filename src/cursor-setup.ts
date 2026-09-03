import { apiLog } from "./cursor-api-logger";
import type { CursorHeaders, SetupCache, UsagePayload } from "./cursor-api-types";
import { asRecord, withTimeout } from "./cursor-api-utils";
import { buildPlanInfo } from "./plan-labels";
import { getCachedSetup, storeSetupCache } from "./cursor-setup-cache";
import { extractUsageFromSummary, extractUsageTotals } from "./cursor-usage-parsing";

export function withPlanInfo(payload: UsagePayload, setup: SetupCache): UsagePayload {
  return { ...payload, planInfo: setup.planInfo };
}

function readPlanFields(stripe: unknown, summary: unknown): {
  limitType: string | null;
  membershipType: string | null;
  individualMembershipType: string | null;
  teamMembershipType: string | null;
  isYearlyPlan: boolean;
} {
  const stripeRec = asRecord(stripe);
  const summaryRec = asRecord(summary);
  return {
    limitType: typeof summaryRec?.limitType === "string" ? summaryRec.limitType : null,
    membershipType:
      typeof summaryRec?.membershipType === "string"
        ? summaryRec.membershipType
        : typeof stripeRec?.membershipType === "string"
          ? stripeRec.membershipType
          : null,
    individualMembershipType:
      typeof stripeRec?.individualMembershipType === "string"
        ? stripeRec.individualMembershipType
        : null,
    teamMembershipType:
      typeof stripeRec?.teamMembershipType === "string" ? stripeRec.teamMembershipType : null,
    isYearlyPlan: stripeRec?.isYearlyPlan === true,
  };
}

async function findCurrentTeamMember(
  headers: CursorHeaders,
  teamId: number,
  userId: string,
  email: string | null,
): Promise<Record<string, unknown> | null> {
  const res = await fetch("https://cursor.com/api/dashboard/get-team-spend", withTimeout({
    method: "POST",
    headers,
    body: JSON.stringify({ teamId }),
  }));
  if (!res.ok) {
    apiLog(`get-team-spend for plan info skipped: ${res.status}`);
    return null;
  }

  const dataRecord = asRecord(await res.json()) ?? {};
  const members: unknown[] = Array.isArray(dataRecord.teamMemberSpend) ? dataRecord.teamMemberSpend : [];
  const me = members.find((member) => {
    const record = asRecord(member);
    if (!record) return false;
    const memberEmail = typeof record.email === "string" ? record.email : null;
    const memberAuthId = typeof record.authId === "string" ? record.authId : null;
    return (
      (email && memberEmail === email) ||
      (memberAuthId && memberAuthId === userId) ||
      String(record.userId) === userId
    );
  });
  return me ? (asRecord(me) ?? null) : null;
}

export async function ensureSetup(
  userId: string,
  sessionToken: string,
  headers: CursorHeaders,
  email: string | null = null,
): Promise<SetupCache | null> {
  const cached = getCachedSetup(sessionToken);
  if (cached) {
    return cached;
  }

  apiLog("Running one-time setup (stripe + usage + usage-summary)...");
  const [stripeRes, usageRes, summaryRes] = await Promise.all([
    fetch("https://cursor.com/api/auth/stripe", withTimeout({ headers })),
    fetch(`https://cursor.com/api/usage?user=${userId}`, withTimeout({ headers })),
    fetch("https://cursor.com/api/usage-summary", withTimeout({ headers })),
  ]);

  apiLog(`Setup: Stripe ${stripeRes.status}, Usage ${usageRes.status}, Summary ${summaryRes.status}`);

  const stripe = stripeRes.ok ? await stripeRes.json() : null;
  const usage = usageRes.ok ? await usageRes.json() : null;
  const summary = summaryRes.ok ? await summaryRes.json() : null;
  const totals = extractUsageTotals(usage);
  const summaryPayload = extractUsageFromSummary(summary, Boolean(stripe?.isOnBillableAuto));
  const summaryLimit = summaryPayload?.includedRequests.limit ?? 0;
  const isTeamMember = !!(asRecord(stripe)?.isTeamMember && asRecord(stripe)?.teamId);
  const planFields = readPlanFields(stripe, summary);
  const teamId = asRecord(stripe)?.teamId as number | undefined;
  const teamMember =
    isTeamMember && teamId
      ? await findCurrentTeamMember(headers, teamId, userId, email)
      : null;

  if (teamMember) {
    apiLog(
      `Team member plan keys: billingTier=${String(teamMember.billingTier ?? "n/a")}, role=${String(teamMember.role ?? "n/a")}`,
    );
  }

  const stripeRecord = asRecord(stripe);
  const setup: SetupCache = {
    isTeamMember,
    teamId,
    maxRequestUsage:
      summaryLimit > 0
        ? summaryLimit
        : totals.limit > 0
          ? totals.limit
          : totals.used,
    onDemandEnabled: Boolean(stripeRecord?.isOnBillableAuto),
    stripeRecord,
    planInfo: buildPlanInfo({
      isTeamMember,
      limitType: planFields.limitType,
      membershipType: planFields.membershipType,
      individualMembershipType: planFields.individualMembershipType,
      teamMembershipType: planFields.teamMembershipType,
      billingTier: typeof teamMember?.billingTier === "string" ? teamMember.billingTier : null,
      role: typeof teamMember?.role === "string" ? teamMember.role : null,
      includedLimit: summaryLimit > 0 ? summaryLimit : null,
      isYearlyPlan: planFields.isYearlyPlan,
    }),
  };
  storeSetupCache(setup, sessionToken);

  apiLog(
    `Setup cached: team=${setup.isTeamMember}, teamId=${setup.teamId}, maxReq=${setup.maxRequestUsage}, onDemandEnabled=${setup.onDemandEnabled}, plan=${setup.planInfo?.displayName ?? "unknown"}`,
  );
  return setup;
}
