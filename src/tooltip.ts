import type { UsagePayload } from "./cursor-api";
import { getDurationLabel } from "./duration-options";
import type { UsageDuration } from "./model-breakdown";
import {
  formatOnDemandBreakdownFooter,
  formatOnDemandValue,
  getOnDemandProgressSegments,
  getOnDemandRatio,
  type OnDemandUsage,
} from "./on-demand";

type IncludedRequestsUsage = UsagePayload["includedRequests"];

export type ProgressBarRenderer = {
  markdown: (ratio: number) => string;
  html: (ratio: number) => string;
  segmentedHtml?: (segments: Array<{ ratio: number; opacity: number }>) => string;
  divider: () => string;
};

export const OPEN_DURATION_SETTING_COMMAND = "cursor-usage.openDurationSetting";

type SummaryColumn = {
  label: string;
  value: string;
  footer: string;
};

function formatIncludedValue(includedRequests: IncludedRequestsUsage): string {
  return `${includedRequests.used} / ${includedRequests.limit}`;
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

function renderOnDemandFooter(onDemand: OnDemandUsage, renderProgressBar: ProgressBarRenderer): string {
  const segments = getOnDemandProgressSegments(onDemand);
  if (segments && renderProgressBar.segmentedHtml) {
    const breakdownFooter = formatOnDemandBreakdownFooter(onDemand);
    const bar = renderProgressBar.segmentedHtml(segments);
    return breakdownFooter
      ? `${bar}<br/><sub>${breakdownFooter}</sub>`
      : bar;
  }

  const spendRatio = getOnDemandRatio(onDemand);
  if (spendRatio === null) {
    return "<sub>Spend unavailable</sub>";
  }
  return renderProgressBar.html(spendRatio);
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
    const segments = getOnDemandProgressSegments(onDemand);
    return [
      includedColumn,
      {
        label: "On-demand",
        value: formatOnDemandValue(onDemand),
        footer: segments
          ? renderOnDemandFooter(onDemand, renderProgressBar)
          : "<sub>No limit</sub>",
      },
    ];
  }

  return [
    includedColumn,
    {
      label: "On-demand",
      value: formatOnDemandValue(onDemand),
      footer: renderOnDemandFooter(onDemand, renderProgressBar),
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

export function buildUsageByModelHeadingMarkdown(duration: UsageDuration): string {
  return `**Usage by Model** *(${getDurationLabel(duration)})* &nbsp;[Change](command:${OPEN_DURATION_SETTING_COMMAND})\n\n`;
}
