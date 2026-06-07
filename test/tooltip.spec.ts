import { describe, expect, it } from "bun:test";
import { buildUsageByModelHeadingMarkdown, buildUsageOverviewMarkdown } from "../src/tooltip";

const progressBar = {
  markdown: (ratio: number) => `[bar:${ratio.toFixed(2)}]`,
  html: (ratio: number) => `<bar:${ratio.toFixed(2)}>`,
  divider: () => "<divider />",
};

describe("buildUsageOverviewMarkdown", () => {
  it("renders a balanced two-column summary for limited on-demand spend", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "limited", onDemandEnabled: true, spendDollars: 66.89, limitDollars: 200 },
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89 / $200.00</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<bar:0.33>");
    expect(markdown.match(/<table/g)?.length).toBe(1);
    expect(markdown).not.toContain("width=\"49%\"");
    expect(markdown).not.toContain("100% used");
    expect(markdown).not.toContain("of $200.00 (33%)");
    expect(markdown).not.toContain("Included Requests");
    expect(markdown).not.toContain("On-Demand Spend");
  });

  it("renders unlimited copy on the bottom row so the columns stay aligned", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 500, limit: 500 },
        onDemand: { state: "unlimited", onDemandEnabled: true, spendDollars: 66.89, limitDollars: null },
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<tr><td><bar:1.00></td><td><sub>No limit</sub></td></tr>");
    expect(markdown.match(/<table/g)?.length).toBe(1);
    expect(markdown).not.toContain("width=\"49%\"");
    expect(markdown).not.toContain("100% used");
    expect(markdown).not.toContain("Unlimited");
    expect(markdown).not.toContain("Included Requests");
    expect(markdown).not.toContain("On-Demand Spend");
  });

  it("renders on-demand at zero cap when spending is disabled", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 42, limit: 500 },
        onDemand: {
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
        },
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<strong>$0.00</strong>");
    expect(markdown).toContain("<divider />");
    expect(markdown).toContain("<sub>Left $0.00 / $0.00</sub>");
  });
});

describe("buildUsageByModelHeadingMarkdown", () => {
  it("includes a Change link that routes to the duration setting", () => {
    const markdown = buildUsageByModelHeadingMarkdown("billingCycle");

    expect(markdown).toContain("**Usage by Model** *(Current Billing Cycle)*");
    expect(markdown).toContain("[Change](command:cursor-usage.openDurationSetting)");
  });
});
