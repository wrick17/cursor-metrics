import { cardHelpButton, cardLabel } from "./summary-cards.js";
import { local } from "./core.js";
import { getDateLocale, t } from "./i18n.js";
import { escapeHtml, formatPercent } from "./format.js";
import { formatDailyBudgetResetCountdown } from "../../../src/daily-budget-reset.ts";

function formatProjectionDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric", year: "numeric" });
}

function renderDepletionLine(label, projection, resetAtIso) {
  if (!projection) return "";
  const avg = formatPercent(projection.avgDailyPercent) + t("perDay");

  if (projection.status === "exhausted") {
    return (
      '<div class="pool-projection-row">' +
        '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
        '<span class="pool-projection-value exhausted">' + escapeHtml(t("alreadyExhausted")) + "</span>" +
        '<span class="pool-projection-avg muted">' + escapeHtml(avg) + "</span>" +
      "</div>"
    );
  }

  if (projection.status === "no_usage") {
    return (
      '<div class="pool-projection-row">' +
        '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
        '<span class="pool-projection-value muted">' + escapeHtml(t("noUsageYet")) + "</span>" +
      "</div>"
    );
  }

  let valueText = "~" + formatProjectionDate(projection.projectedAtIso);
  if (projection.status === "after_reset") {
    const resetText = resetAtIso ? formatProjectionDate(resetAtIso) : t("rangeBilling");
    valueText = resetText + " (" + formatProjectionDate(projection.projectedAtIso) + ")";
  }

  return (
    '<div class="pool-projection-row">' +
      '<span class="pool-projection-label">' + escapeHtml(label) + "</span>" +
      '<span class="pool-projection-value">' + escapeHtml(valueText) + "</span>" +
      '<span class="pool-projection-avg muted">' + escapeHtml(avg) + "</span>" +
    "</div>"
  );
}

function renderTodayPaceRow(label, pace) {
  if (!pace) return "";
  const { allowance, used, residual } = pace;
  // Normalize to today's allowance so the bar is readable (matches tooltip markdown).
  const usedRatio = allowance > 0 ? used / allowance : 0;
  const usedWidth = Math.min(Math.max(usedRatio, 0), 1) * 100;
  const allowanceWidth = 100;
  const budgetZoneWidth = usedRatio < 1 ? (1 - Math.min(usedRatio, 1)) * 100 : 0;
  const overWidth = usedRatio > 1 ? Math.min((usedRatio - 1) * 100, 100) : 0;

  let statusText;
  let statusClass;
  if (residual > 0.05) {
    statusText = formatPercent(residual) + "% " + t("leftToday");
    statusClass = "under";
  } else if (residual < -0.05) {
    statusText = formatPercent(Math.abs(residual)) + "% " + t("overPace");
    statusClass = "over";
  } else {
    statusText = t("onPace");
    statusClass = "on-budget";
  }

  const overSegment =
    overWidth > 0
      ? '<div class="pool-pace-over" style="width:' + overWidth + '%"></div>'
      : "";
  const budgetZoneSegment =
    budgetZoneWidth > 0
      ? '<div class="pool-pace-budget-zone" style="width:' + budgetZoneWidth + '%"></div>'
      : "";

  return (
    '<div class="pool-pace-row">' +
      '<span class="pool-pace-label">' + escapeHtml(label) + "</span>" +
      '<div class="pool-pace-bar" title="Budget ' + formatPercent(allowance) + '%, used ' + formatPercent(used) + '%">' +
        '<div class="pool-pace-track">' +
          '<div class="pool-pace-used" style="width:' + usedWidth + '%"></div>' +
          budgetZoneSegment +
          overSegment +
          '<div class="pool-pace-marker" style="left:' + allowanceWidth + '%"></div>' +
        "</div>" +
      "</div>" +
      '<span class="pool-pace-status ' + statusClass + '">' + escapeHtml(statusText) + "</span>" +
    "</div>"
  );
}

function renderTodayPace(poolSeries) {
  if (!poolSeries?.todayAutoPace && !poolSeries?.todayApiPace) return "";
  const resetCountdown = formatDailyBudgetResetCountdown(local.locale);
  return (
    '<div class="pool-pace">' +
      '<div class="pool-projection-title">' +
        cardHelpButton("poolPace") +
        "<span>" + escapeHtml(t("todayPace")) + "</span>" +
      "</div>" +
      '<p class="muted small pool-pace-reset" id="daily-budget-reset-countdown">' + escapeHtml(resetCountdown) + "</p>" +
      renderTodayPaceRow(t("poolFirstParty"), poolSeries.todayAutoPace) +
      renderTodayPaceRow(t("poolApi"), poolSeries.todayApiPace) +
    "</div>"
  );
}

function renderRecommendedPace(poolUsage, poolRecommended) {
  if (!poolRecommended) return "";
  const autoRec = Math.min(Math.max(poolRecommended.autoRecommended, 0), 100);
  const apiRec = Math.min(Math.max(poolRecommended.apiRecommended, 0), 100);
  const autoUsed = Math.min(Math.max(poolUsage.autoPercentUsed, 0), 100);
  const apiUsed = Math.min(Math.max(poolUsage.apiPercentUsed, 0), 100);

  function row(label, recPct, usedPct) {
    const usedWidth = usedPct;
    const targetWidth = recPct;
    return (
      '<div class="pool-pace-row pool-recommended-row">' +
        '<span class="pool-pace-label">' + escapeHtml(label) + "</span>" +
        '<div class="pool-pace-bar" title="' +
          escapeHtml(t("usedLabel")) + " " + formatPercent(usedPct) + "%, " +
          escapeHtml(t("recTarget")) + " " + formatPercent(recPct) + '%">' +
          '<div class="pool-pace-track">' +
            '<div class="pool-pace-used" style="width:' + usedWidth + '%"></div>' +
            '<div class="pool-pace-marker pool-recommended-marker" style="left:' + targetWidth + '%"></div>' +
          "</div>" +
        "</div>" +
        '<span class="pool-pct">' +
          formatPercent(usedPct) + '% ' +
          '<span class="pool-target-pct muted">/ ' + formatPercent(recPct) + "% " + escapeHtml(t("recTarget")) + "</span>" +
        "</span>" +
      "</div>"
    );
  }

  return (
    '<div class="pool-recommended">' +
      '<div class="pool-projection-title">' +
        cardHelpButton("poolRecommended") +
        "<span>" + escapeHtml(t("recommendedPace")) + "</span>" +
      "</div>" +
      '<p class="muted small pool-recommended-desc">' + escapeHtml(t("recommendedPaceDesc")) + "</p>" +
      row(t("poolFirstParty"), autoRec, autoUsed) +
      row(t("poolApi"), apiRec, apiUsed) +
    "</div>"
  );
}

export function updateDailyBudgetResetCountdown() {
  const el = document.getElementById("daily-budget-reset-countdown");
  if (!el) return;
  el.textContent = formatDailyBudgetResetCountdown(local.locale);
}

export function renderPoolUsageCard(poolUsage, poolDepletion, resetAtIso, poolSeries, poolRecommended) {
  const autoPct = Math.min(Math.max(poolUsage.autoPercentUsed, 0), 100);
  const apiPct = Math.min(Math.max(poolUsage.apiPercentUsed, 0), 100);
  const totalPct = Math.min(Math.max(poolUsage.totalPercentUsed, 0), 100);
  const projections = poolDepletion
    ? renderDepletionLine(t("poolFirstParty"), poolDepletion.auto, resetAtIso) +
      renderDepletionLine(t("poolApi"), poolDepletion.api, resetAtIso)
    : "";

  return (
    '<div class="card card-pool">' +
      cardLabel(t("includedPool"), "includedPool") +
      '<div class="card-value">' + formatPercent(totalPct) + "% " + escapeHtml(t("totalUsed")) + "</div>" +
      '<div class="pool-rows">' +
        '<div class="pool-row">' +
          '<span class="pool-label">' + escapeHtml(t("poolFirstParty")) + "</span>" +
          '<div class="progress pool-progress"><div style="width:' + autoPct + '%"></div></div>' +
          '<span class="pool-pct">' + formatPercent(autoPct) + "%</span>" +
        "</div>" +
        '<div class="pool-row">' +
          '<span class="pool-label">' + escapeHtml(t("poolApi")) + "</span>" +
          '<div class="progress pool-progress"><div style="width:' + apiPct + '%"></div></div>' +
          '<span class="pool-pct">' + formatPercent(apiPct) + "%</span>" +
        "</div>" +
      "</div>" +
      renderRecommendedPace(poolUsage, poolRecommended) +
      (projections
        ? '<div class="pool-projection">' +
            '<div class="pool-projection-title">' +
              cardHelpButton("poolDepletion") +
              '<span>' + escapeHtml(t("projectedPace")) + "</span>" +
            "</div>" +
            projections +
          "</div>"
        : "") +
      renderTodayPace(poolSeries) +
    "</div>"
  );
}
