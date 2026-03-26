import type { UsagePayload } from "./cursor-api";

type IncludedRequestsUsage = UsagePayload["includedRequests"];
type OnDemandUsage = UsagePayload["onDemand"];

type ProgressBarRenderer = {
  markdown: (ratio: number) => string;
  html: (ratio: number) => string;
  divider: () => string;
};

function getOnDemandRatio(onDemand: OnDemandUsage): number | null {
  if (onDemand.state !== "limited") return null;
  if (onDemand.limitDollars === null || onDemand.limitDollars <= 0) return null;
  return onDemand.spendDollars / onDemand.limitDollars;
}

type SummaryColumn = {
  label: string;
  value: string;
  footer: string;
};

function formatIncludedValue(includedRequests: IncludedRequestsUsage): string {
  return `${includedRequests.used} / ${includedRequests.limit}`;
}

function formatOnDemandValue(onDemand: OnDemandUsage): string {
  return `$${onDemand.spendDollars.toFixed(2)}`;
}

function buildSummaryTable(columns: SummaryColumn[], renderProgressBar: ProgressBarRenderer): string {
  if (columns.length === 1) {
    return [
      `<table width="100%" cellspacing="0" cellpadding="0">`,
      `  <tr><td width="100%"><sub>${columns[0]!.label}</sub></td></tr>`,
      `  <tr><td><strong>${columns[0]!.value}</strong></td></tr>`,
      `  <tr><td>${columns[0]!.footer}</td></tr>`,
      `</table>`,
      ``,
    ].join("\n");
  }

  return [
    `<table width="100%" cellspacing="0" cellpadding="0">`,
    `  <tr><td><sub>${columns[0]!.label}</sub></td><td width="2%" rowspan="3" valign="top">${renderProgressBar.divider()}</td><td><sub>${columns[1]!.label}</sub></td></tr>`,
    `  <tr><td><strong>${columns[0]!.value}</strong></td><td><strong>${columns[1]!.value}</strong></td></tr>`,
    `  <tr><td>${columns[0]!.footer}</td><td>${columns[1]!.footer}</td></tr>`,
    `</table>`,
    ``,
  ].join("\n");
}

function buildSummaryColumns(
  includedRequests: IncludedRequestsUsage,
  onDemand: OnDemandUsage,
  renderProgressBar: ProgressBarRenderer,
): SummaryColumn[] {
  const reqRatio = includedRequests.limit > 0 ? includedRequests.used / includedRequests.limit : 0;
  const includedColumn: SummaryColumn = {
    label: "Included",
    value: formatIncludedValue(includedRequests),
    footer: renderProgressBar.html(reqRatio),
  };

  if (onDemand.state === "disabled") {
    return [includedColumn];
  }

  if (onDemand.state === "unlimited") {
    return [
      includedColumn,
      {
        label: "On-demand",
        value: formatOnDemandValue(onDemand),
        footer: "<sub>Unlimited</sub>",
      },
    ];
  }

  const spendRatio = getOnDemandRatio(onDemand);

  return [
    includedColumn,
    {
      label: "On-demand",
      value: formatOnDemandValue(onDemand),
      footer: spendRatio === null ? "<sub>Spend unavailable</sub>" : renderProgressBar.html(spendRatio),
    },
  ];
}

export function buildUsageOverviewMarkdown(
  data: Pick<UsagePayload, "includedRequests" | "onDemand">,
  renderProgressBar: ProgressBarRenderer,
): string {
  const { includedRequests, onDemand } = data;
  return buildSummaryTable(buildSummaryColumns(includedRequests, onDemand, renderProgressBar), renderProgressBar);
}
