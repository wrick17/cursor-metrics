import { t } from "./i18n.js";
import { formatDollars } from "./format.js";

function breakdownMySpend(onDemand) {
  if (onDemand.breakdown && typeof onDemand.breakdown.mySpendDollars === "number") {
    return onDemand.breakdown.mySpendDollars;
  }
  return onDemand.spendDollars || 0;
}

export function formatOnDemandFooter(onDemand) {
  if (onDemand.onDemandEnabled === false && !onDemand.breakdown) {
    return "Left " + formatDollars(0) + " / " + formatDollars(0);
  }
  const breakdown = onDemand.breakdown;
  if (!breakdown) {
    return onDemand.state === "unlimited" ? t("unlimited") : t("onDemandFooter");
  }
  if (onDemand.onDemandEnabled === false) {
    const leftTotal = "Left " + formatDollars(0) + " / " + formatDollars(0);
    if (breakdown.isTeamPool) {
      return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + leftTotal;
    }
    return leftTotal;
  }
  if (onDemand.state === "unlimited") {
    if (breakdown.isTeamPool) {
      return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + t("unlimited");
    }
    return t("unlimited");
  }
  if (onDemand.state !== "limited") return t("onDemandFooter");
  const limit = onDemand.limitDollars || 0;
  const leftTotal = "Left " + formatDollars(breakdown.remainingDollars) + " / " + formatDollars(limit);
  if (breakdown.isTeamPool) {
    return "Team " + formatDollars(breakdown.othersSpendDollars) + " · " + leftTotal;
  }
  return leftTotal;
}

export function formatOnDemandValue(onDemand) {
  const mySpend = breakdownMySpend(onDemand);
  if (
    onDemand.state === "unlimited" ||
    onDemand.onDemandEnabled === false ||
    (onDemand.breakdown && onDemand.breakdown.isTeamPool)
  ) {
    return formatDollars(mySpend);
  }
  return formatDollars(mySpend) + " / " + formatDollars(onDemand.limitDollars || 0);
}

export function renderOnDemandProgress(onDemand) {
  const limit = onDemand.limitDollars || 0;
  const breakdown = onDemand.breakdown;

  if (onDemand.state === "unlimited" && breakdown) {
    const totalSpend = breakdown.totalSpendDollars || 0;
    if (totalSpend <= 0) {
      return '<div class="progress"><div style="width:0%"></div></div>';
    }
    const youPct = Math.round((breakdown.mySpendDollars / totalSpend) * 100);
    const othersPct = Math.max(0, 100 - youPct);
    return (
      '<div class="progress progress-segmented">' +
        '<div class="progress-you" style="width:' + youPct + '%"></div>' +
        '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
      "</div>"
    );
  }

  if (onDemand.state === "limited") {
    if (limit <= 0) {
      const totalSpend = breakdown
        ? breakdown.totalSpendDollars
        : onDemand.spendDollars || 0;
      if (totalSpend <= 0) {
        return '<div class="progress"><div style="width:0%"></div></div>';
      }
      if (!breakdown) {
        return '<div class="progress"><div style="width:100%"></div></div>';
      }
      const youPct = Math.round((breakdown.mySpendDollars / totalSpend) * 100);
      const othersPct = Math.max(0, 100 - youPct);
      return (
        '<div class="progress progress-segmented">' +
          '<div class="progress-you" style="width:' + youPct + '%"></div>' +
          '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
        "</div>"
      );
    }

    if (!breakdown) {
      const ratio = Math.min(1, breakdownMySpend(onDemand) / limit);
      return '<div class="progress"><div style="width:' + Math.round(ratio * 100) + '%"></div></div>';
    }

    const totalSpend = breakdown.totalSpendDollars || 0;
    const scale = limit > 0 && totalSpend > limit ? totalSpend : limit > 0 ? limit : totalSpend;
    if (scale <= 0) {
      return '<div class="progress"><div style="width:0%"></div></div>';
    }
    const youPct = Math.round((breakdown.mySpendDollars / scale) * 100);
    const othersPct = Math.round((breakdown.othersSpendDollars / scale) * 100);
    return (
      '<div class="progress progress-segmented">' +
        '<div class="progress-you" style="width:' + youPct + '%"></div>' +
        '<div class="progress-others" style="width:' + othersPct + '%"></div>' +
      "</div>"
    );
  }

  return '<div class="progress"><div style="width:0%"></div></div>';
}
