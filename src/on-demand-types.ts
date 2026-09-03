export type OnDemandBreakdown = {
  mySpendDollars: number;
  othersSpendDollars: number;
  totalSpendDollars: number;
  remainingDollars: number;
  isTeamPool: boolean;
};

export type OnDemandUsage = {
  state: "disabled" | "limited" | "unlimited";
  onDemandEnabled: boolean;
  spendDollars: number;
  limitDollars: number | null;
  breakdown?: OnDemandBreakdown;
};

export type ProgressSegment = { ratio: number; opacity: number };
