import { describe, expect, it } from "bun:test";
import {
  buildOnDemandFromSpendLimit,
  buildTeamOnDemandFallback,
  finalizeOnDemandUsage,
  formatOnDemandBreakdownFooter,
  formatOnDemandValue,
  getOnDemandBarScaleDollars,
  getOnDemandProgressSegments,
  mergeOnDemandUsage,
  resolveMemberLimitDollars,
  inferOnDemandDisabledFromSpendLimit,
  resolveOnDemandEnabled,
  resolveOnDemandFromUsageSummary,
} from "../src/on-demand";

describe("buildOnDemandFromSpendLimit", () => {
  it("returns a zero-cap limited state when on-demand is off and there is no spend", () => {
    expect(buildOnDemandFromSpendLimit(null, false)).toEqual({
      state: "limited",
      onDemandEnabled: false,
      spendDollars: 0,
      limitDollars: 0,
      breakdown: {
        mySpendDollars: 0,
        othersSpendDollars: 0,
        totalSpendDollars: 0,
        remainingDollars: 0,
        isTeamPool: false,
      },
    });
  });

  it("shows cycle spend with a zero limit when on-demand is disabled", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        pooledLimit: 0,
        pooledUsed: 30_000,
        individualUsed: 5_000,
        limitType: "team",
      },
      false,
      5_000,
    );

    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(0);
    expect(result.spendDollars).toBe(50);
    expect(result.breakdown).toEqual({
      mySpendDollars: 50,
      othersSpendDollars: 250,
      totalSpendDollars: 300,
      remainingDollars: 0,
      isTeamPool: true,
    });
  });

  it("shows usage with a zero limit when the pool cap was removed", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        pooledLimit: 0,
        pooledUsed: 12_500,
        individualUsed: 2_500,
        limitType: "team",
      },
      true,
      2_500,
    );

    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(0);
    expect(result.breakdown?.totalSpendDollars).toBe(125);
  });

  it("parses individual on-demand limits for personal plans", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        individualLimit: 20_000,
        individualUsed: 6_689,
        individualRemaining: 13_311,
        limitType: "user",
      },
      true,
    );

    expect(result.state).toBe("limited");
    expect(result.spendDollars).toBeCloseTo(66.89, 2);
    expect(result.limitDollars).toBe(200);
    expect(result.breakdown).toEqual({
      mySpendDollars: 66.89,
      othersSpendDollars: 0,
      totalSpendDollars: 66.89,
      remainingDollars: 133.11,
      isTeamPool: false,
    });
  });

  it("shows team spend shares with no cap when on-demand is enabled without a pool limit", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        pooledUsed: 12_500,
        individualUsed: 2_500,
        limitType: "team",
      },
      true,
      2_500,
    );

    expect(result.state).toBe("unlimited");
    expect(result.limitDollars).toBeNull();
    expect(result.breakdown).toEqual({
      mySpendDollars: 25,
      othersSpendDollars: 100,
      totalSpendDollars: 125,
      remainingDollars: 0,
      isTeamPool: true,
    });
  });

  it("shows pooled team limit before any spend is recorded", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        pooledLimit: 30_000,
        pooledUsed: 0,
        pooledRemaining: 30_000,
        limitType: "team",
      },
      true,
    );

    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(300);
    expect(result.spendDollars).toBe(0);
    expect(result.breakdown).toEqual({
      mySpendDollars: 0,
      othersSpendDollars: 0,
      totalSpendDollars: 0,
      remainingDollars: 300,
      isTeamPool: true,
    });
    expect(formatOnDemandBreakdownFooter(result)).toBe("Team $0.00 · Left $300.00 / $300.00");
  });

  it("parses pooled team limits with you, team, and remaining breakdown", () => {
    const result = buildOnDemandFromSpendLimit(
      {
        pooledLimit: 50_000,
        pooledUsed: 12_500,
        pooledRemaining: 37_500,
        individualUsed: 2_500,
        limitType: "team",
      },
      true,
      2_500,
    );

    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(500);
    expect(result.spendDollars).toBe(25);
    expect(result.breakdown).toEqual({
      mySpendDollars: 25,
      othersSpendDollars: 100,
      totalSpendDollars: 125,
      remainingDollars: 375,
      isTeamPool: true,
    });
  });
});

describe("buildTeamOnDemandFallback", () => {
  it("shows team spend with a zero limit when on-demand is disabled", () => {
    const members = [
      { email: "me@example.com", spendCents: 2_500 },
      { email: "peer@example.com", spendCents: 10_000 },
    ];
    const me = { email: "me@example.com", spendCents: 2_500 };

    const result = buildTeamOnDemandFallback(members, me, {}, false);
    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(0);
    expect(result.breakdown?.mySpendDollars).toBe(25);
    expect(result.breakdown?.othersSpendDollars).toBe(100);
    expect(result.breakdown?.remainingDollars).toBe(0);
  });

  it("uses monthlyLimitDollars when hardLimitOverride is zero", () => {
    const members = [
      { email: "me@example.com", spendCents: 2_500 },
      { email: "peer@example.com", spendCents: 10_000 },
    ];
    const me = {
      email: "me@example.com",
      spendCents: 2_500,
      hardLimitOverrideDollars: 0,
      monthlyLimitDollars: 300,
    };

    const result = buildTeamOnDemandFallback(members, me, {}, true);
    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(300);
    expect(result.breakdown?.mySpendDollars).toBe(25);
    expect(result.breakdown?.othersSpendDollars).toBe(100);
    expect(result.breakdown?.remainingDollars).toBe(175);
  });
});

describe("resolveMemberLimitDollars", () => {
  it("prefers hard limit override over monthly limit", () => {
    expect(resolveMemberLimitDollars({
      hardLimitOverrideDollars: 150,
      monthlyLimitDollars: 300,
    })).toBe(150);
  });

  it("falls back to monthly limit when override is zero", () => {
    expect(resolveMemberLimitDollars({
      hardLimitOverrideDollars: 0,
      monthlyLimitDollars: 300,
    })).toBe(300);
  });
});

describe("inferOnDemandDisabledFromSpendLimit", () => {
  it("detects disabled team pools with spend but zero remaining and no cap", () => {
    expect(inferOnDemandDisabledFromSpendLimit({
      limitType: "team",
      pooledUsed: 30_000,
      individualUsed: 5_000,
      pooledRemaining: 0,
    })).toBe(true);
  });

  it("does not flag uncapped team pools that omit remaining", () => {
    expect(inferOnDemandDisabledFromSpendLimit({
      limitType: "team",
      pooledUsed: 12_500,
      individualUsed: 2_500,
    })).toBe(false);
  });
});

describe("resolveOnDemandFromUsageSummary", () => {
  it("reads team on-demand toggle from usage-summary", () => {
    expect(resolveOnDemandFromUsageSummary({
      teamUsage: { onDemand: { enabled: false, used: 30_001 } },
      individualUsage: { onDemand: { enabled: true } },
    }, true)).toBe(false);
  });

  it("reads individual on-demand toggle for personal accounts", () => {
    expect(resolveOnDemandFromUsageSummary({
      individualUsage: { onDemand: { enabled: false, used: 500 } },
    }, false)).toBe(false);
  });
});

describe("resolveOnDemandEnabled", () => {
  const stripeOn = { isOnBillableAuto: true };
  const stripeOff = { isOnBillableAuto: false };

  it("prefers usage-summary over stripe when on-demand is disabled", () => {
    expect(resolveOnDemandEnabled(
      stripeOn,
      {
        enabled: true,
        spendLimitUsage: {
          limitType: "team",
          pooledUsed: 30_001,
        },
      },
      null,
      false,
    )).toBe(false);
  });

  it("treats period usage as disabled when enabled is false and there is no spend limit", () => {
    expect(resolveOnDemandEnabled(stripeOn, { enabled: false })).toBe(false);
    expect(resolveOnDemandEnabled(stripeOn, { enabled: true })).toBe(true);
    expect(resolveOnDemandEnabled(stripeOff, { enabled: true })).toBe(false);
  });

  it("treats team pool with zero remaining as disabled even when period.enabled is true", () => {
    expect(resolveOnDemandEnabled(stripeOn, {
      enabled: true,
      spendLimitUsage: {
        limitType: "team",
        pooledUsed: 30_000,
        individualUsed: 5_000,
        pooledRemaining: 0,
      },
    })).toBe(false);
  });

  it("prefers explicit usage-based pricing flags on stripe", () => {
    expect(resolveOnDemandEnabled(
      { isOnBillableAuto: true, usageBasedPricingEnabled: false },
      { enabled: true },
    )).toBe(false);
    expect(resolveOnDemandEnabled(
      { isOnBillableAuto: false, usageBasedPricingEnabled: true },
      { enabled: true },
    )).toBe(true);
  });
});

describe("finalizeOnDemandUsage", () => {
  it("coerces unlimited to zero cap when on-demand is disabled", () => {
    const result = finalizeOnDemandUsage(
      {
        state: "unlimited",
        onDemandEnabled: true,
        spendDollars: 50,
        limitDollars: null,
        breakdown: {
          mySpendDollars: 50,
          othersSpendDollars: 250,
          totalSpendDollars: 300,
          remainingDollars: 0,
          isTeamPool: true,
        },
      },
      false,
    );

    expect(result.onDemandEnabled).toBe(false);
    expect(result.state).toBe("limited");
    expect(result.limitDollars).toBe(0);
    expect(formatOnDemandBreakdownFooter(result)).toBe("Team $250.00 · Left $0.00 / $0.00");
    expect(formatOnDemandBreakdownFooter(result)).not.toContain("No limit");
  });
});

describe("getOnDemandBarScaleDollars", () => {
  it("uses team total as bar scale when usage exceeds the cap", () => {
    const onDemand = {
      state: "limited" as const,
      onDemandEnabled: true,
      spendDollars: 100,
      limitDollars: 500,
      breakdown: {
        mySpendDollars: 100,
        othersSpendDollars: 400,
        totalSpendDollars: 600,
        remainingDollars: 0,
        isTeamPool: true,
      },
    };

    expect(getOnDemandBarScaleDollars(onDemand)).toBe(600);
    expect(getOnDemandProgressSegments(onDemand)).toEqual([
      { ratio: 100 / 600, opacity: 0.9 },
      { ratio: 400 / 600, opacity: 0.45 },
    ]);
  });
});

describe("mergeOnDemandUsage", () => {
  it("prefers a limited result from either source when on-demand is enabled", () => {
    const limited = { state: "limited" as const, onDemandEnabled: true, spendDollars: 10, limitDollars: 100 };
    const unlimited = { state: "unlimited" as const, onDemandEnabled: true, spendDollars: 10, limitDollars: null };
    expect(mergeOnDemandUsage(unlimited, limited, true)).toEqual(limited);
    expect(mergeOnDemandUsage(limited, unlimited, true)).toEqual(limited);
  });

  it("prefers a zero cap over unlimited when on-demand is disabled", () => {
    const unlimited = {
      state: "unlimited" as const,
      onDemandEnabled: true,
      spendDollars: 50,
      limitDollars: null,
      breakdown: {
        mySpendDollars: 50,
        othersSpendDollars: 250,
        totalSpendDollars: 300,
        remainingDollars: 0,
        isTeamPool: true,
      },
    };
    const disabledCap = {
      state: "limited" as const,
      onDemandEnabled: false,
      spendDollars: 50,
      limitDollars: 0,
      breakdown: unlimited.breakdown,
    };

    expect(mergeOnDemandUsage(unlimited, disabledCap, false)).toEqual(disabledCap);
  });
});

describe("getOnDemandProgressSegments", () => {
  it("uses spend shares for unlimited team pools", () => {
    const segments = getOnDemandProgressSegments({
      state: "unlimited",
      spendDollars: 25,
      limitDollars: null,
      breakdown: {
        mySpendDollars: 25,
        othersSpendDollars: 100,
        totalSpendDollars: 125,
        remainingDollars: 0,
        isTeamPool: true,
      },
    });

    expect(segments).toEqual([
      { ratio: 0.2, opacity: 0.9 },
      { ratio: 0.8, opacity: 0.45 },
    ]);
  });

  it("uses spend shares when the limit is zero", () => {
    const segments = getOnDemandProgressSegments({
      state: "limited",
      spendDollars: 50,
      limitDollars: 0,
      breakdown: {
        mySpendDollars: 50,
        othersSpendDollars: 250,
        totalSpendDollars: 300,
        remainingDollars: 0,
        isTeamPool: true,
      },
    });

    expect(segments).toEqual([
      { ratio: 50 / 300, opacity: 0.9 },
      { ratio: 250 / 300, opacity: 0.45 },
    ]);
  });

  it("returns separate segments for you and team usage", () => {
    const segments = getOnDemandProgressSegments({
      state: "limited",
      spendDollars: 25,
      limitDollars: 500,
      breakdown: {
        mySpendDollars: 25,
        othersSpendDollars: 100,
        totalSpendDollars: 125,
        remainingDollars: 375,
        isTeamPool: true,
      },
    });

    expect(segments).toEqual([
      { ratio: 0.05, opacity: 0.9 },
      { ratio: 0.2, opacity: 0.45 },
    ]);
  });
});

describe("formatOnDemandValue", () => {
  it("shows only personal spend for team pools", () => {
    const value = formatOnDemandValue({
      state: "limited",
      onDemandEnabled: true,
      spendDollars: 25,
      limitDollars: 500,
      breakdown: {
        mySpendDollars: 25,
        othersSpendDollars: 100,
        totalSpendDollars: 125,
        remainingDollars: 375,
        isTeamPool: true,
      },
    });

    expect(value).toBe("$25.00");
  });
});

describe("formatOnDemandBreakdownFooter", () => {
  it("shows team dollars and no limit when spending is uncapped", () => {
    const footer = formatOnDemandBreakdownFooter({
      state: "unlimited",
      onDemandEnabled: true,
      spendDollars: 25,
      limitDollars: null,
      breakdown: {
        mySpendDollars: 25,
        othersSpendDollars: 100,
        totalSpendDollars: 125,
        remainingDollars: 0,
        isTeamPool: true,
      },
    });

    expect(footer).toBe("Team $100.00 · No limit");
  });

  it("shows team usage and pool total below the bar", () => {
    const footer = formatOnDemandBreakdownFooter({
      state: "limited",
      onDemandEnabled: true,
      spendDollars: 25,
      limitDollars: 500,
      breakdown: {
        mySpendDollars: 25,
        othersSpendDollars: 100,
        totalSpendDollars: 125,
        remainingDollars: 375,
        isTeamPool: true,
      },
    });

    expect(footer).toBe("Team $100.00 · Left $375.00 / $500.00");
  });

  it("shows zero cap footer when on-demand is disabled", () => {
    const footer = formatOnDemandBreakdownFooter({
      state: "limited",
      onDemandEnabled: false,
      spendDollars: 50,
      limitDollars: 0,
      breakdown: {
        mySpendDollars: 50,
        othersSpendDollars: 250,
        totalSpendDollars: 300,
        remainingDollars: 0,
        isTeamPool: true,
      },
    });

    expect(footer).toBe("Team $250.00 · Left $0.00 / $0.00");
    expect(footer).not.toContain("No limit");
  });

  it("shows team dollars when the limit is zero", () => {
    const footer = formatOnDemandBreakdownFooter({
      state: "limited",
      onDemandEnabled: true,
      spendDollars: 50,
      limitDollars: 0,
      breakdown: {
        mySpendDollars: 50,
        othersSpendDollars: 250,
        totalSpendDollars: 300,
        remainingDollars: 0,
        isTeamPool: true,
      },
    });

    expect(footer).toBe("Team $250.00 · Left $0.00 / $0.00");
  });
});
