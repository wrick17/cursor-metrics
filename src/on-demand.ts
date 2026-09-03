export type { OnDemandBreakdown, OnDemandUsage, ProgressSegment } from "./on-demand-types";

export {
  buildOnDemandFromSpendLimit,
  buildTeamOnDemandFallback,
  finalizeOnDemandUsage,
  getOnDemandTotalSpend,
  mergeOnDemandUsage,
  resolveMemberLimitDollars,
} from "./on-demand-build";

export {
  inferOnDemandDisabledFromSpendLimit,
  resolveOnDemandEnabled,
  resolveOnDemandFromUsageSummary,
} from "./on-demand-resolve";

export {
  formatOnDemandBreakdownFooter,
  formatOnDemandValue,
  getOnDemandBarScaleDollars,
  getOnDemandDisplaySpend,
  getOnDemandProgressSegments,
  getOnDemandRatio,
  isOnDemandVisible,
} from "./on-demand-display";
