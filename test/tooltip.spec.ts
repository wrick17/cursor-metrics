import { describe, expect, it } from "bun:test";
import { buildUsageOverviewMarkdown } from "../src/tooltip";

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
        onDemand: { state: "limited", spendDollars: 66.89, limitDollars: 200 },
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89</strong>");
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
        onDemand: { state: "unlimited", spendDollars: 66.89, limitDollars: null },
      },
      progressBar,
    );

    expect(markdown).toContain("<td><sub>Included</sub></td>");
    expect(markdown).toContain("<td><sub>On-demand</sub></td>");
    expect(markdown).toContain("<td width=\"2%\" rowspan=\"3\" valign=\"top\"><divider /></td>");
    expect(markdown).toContain("<strong>500 / 500</strong>");
    expect(markdown).toContain("<strong>$66.89</strong>");
    expect(markdown).toContain("<bar:1.00>");
    expect(markdown).toContain("<tr><td><bar:1.00></td><td><sub>Unlimited</sub></td></tr>");
    expect(markdown.match(/<table/g)?.length).toBe(1);
    expect(markdown).not.toContain("width=\"49%\"");
    expect(markdown).not.toContain("100% used");
    expect(markdown).not.toContain("No spend cap");
    expect(markdown).not.toContain("Included Requests");
    expect(markdown).not.toContain("On-Demand Spend");
  });

  it("renders a single-column balanced summary when on-demand is hidden", () => {
    const markdown = buildUsageOverviewMarkdown(
      {
        includedRequests: { used: 42, limit: 500 },
        onDemand: { state: "disabled", spendDollars: 0, limitDollars: null },
      },
      progressBar,
    );

    expect(markdown).toContain("<table width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">");
    expect(markdown).toContain("<td width=\"100%\"><sub>Included</sub></td>");
    expect(markdown).toContain("<strong>42 / 500</strong>");
    expect(markdown).toContain("<bar:0.08>");
    expect(markdown).not.toContain("<divider />");
    expect(markdown).not.toContain("8% used");
    expect(markdown).not.toContain("On-demand");
  });
});
