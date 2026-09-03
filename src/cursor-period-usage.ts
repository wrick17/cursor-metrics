import { apiLog } from "./cursor-api-logger";
import { asRecord, toNumber, withTimeout } from "./cursor-api-utils";

const CURRENT_PERIOD_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

function connectHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  } as const;
}

export async function fetchCurrentPeriodUsage(
  accessToken: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(CURRENT_PERIOD_USAGE_URL, withTimeout({
    method: "POST",
    headers: connectHeaders(accessToken),
    body: "{}",
  }));

  if (!res.ok) {
    apiLog(`GetCurrentPeriodUsage failed: ${res.status}`);
    return null;
  }

  return asRecord(await res.json());
}

export function billingCycleEndIso(periodUsage: Record<string, unknown> | null): string | null {
  if (!periodUsage) return null;
  const cycleEnd = toNumber(periodUsage.billingCycleEnd);
  if (cycleEnd === null) return null;
  return new Date(cycleEnd).toISOString();
}
