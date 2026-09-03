import { TOKEN_COLORS } from "./core.js";
import { estimateComponentCost } from "../../../src/model-pricing.ts";
import { escapeHtml, formatCents } from "./format.js";
import { t } from "./i18n.js";
import { getPricingState, getEstimateOpts } from "./pricing-shared.js";

export function renderCalculatorPanel(entry) {
  const rates = entry.rates;
  const fields = [];
  if (rates.inputPlusCacheWrite !== undefined) {
    fields.push({ key: "prompt", label: t("pricingInputCacheWrite"), color: TOKEN_COLORS.input });
  } else {
    fields.push({ key: "input", label: t("pricingInput"), color: TOKEN_COLORS.input });
    if (rates.cacheWrite !== undefined) {
      fields.push({ key: "cacheWrite", label: t("pricingCacheWrite"), color: TOKEN_COLORS.cacheWrite });
    }
  }
  if (rates.cacheRead !== undefined) {
    fields.push({ key: "cacheRead", label: t("pricingCacheRead"), color: TOKEN_COLORS.cacheRead });
  }
  fields.push({ key: "output", label: t("pricingOutput"), color: TOKEN_COLORS.output });

  const inputs = fields.map((f) =>
    '<label class="pricing-calc-field">' +
      '<span class="pricing-calc-label"><span class="token-dot" style="background:' + f.color + '"></span>' + escapeHtml(f.label) + "</span>" +
      '<input type="number" min="0" step="1" data-calc-field="' + f.key + '" value="0" />' +
    "</label>"
  ).join("");

  return (
    '<div class="pricing-calc-panel">' +
      '<p class="muted small">' + escapeHtml(t("pricingCalcDesc")) + "</p>" +
      '<div class="pricing-calc-inputs">' + inputs + "</div>" +
      '<div class="pricing-calc-result">' +
        '<div class="pricing-calc-total"><span>' + escapeHtml(t("pricingCalcTotal")) + '</span><strong data-calc-total>—</strong></div>' +
        '<div class="token-bar pricing-calc-bar" data-calc-bar></div>' +
        '<div class="pricing-calc-breakdown" data-calc-breakdown></div>' +
      "</div>" +
    "</div>"
  );
}

export function updateCalculator(detailRow) {
  const modelId = detailRow.dataset.detailFor;
  const entry = getPricingState()?.catalog.models.find((m) => m.id === modelId);
  if (!entry) return;

  const tokens = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  detailRow.querySelectorAll("[data-calc-field]").forEach((input) => {
    const field = input.dataset.calcField;
    const value = Math.max(0, Number(input.value) || 0);
    if (field === "prompt") {
      tokens.inputTokens = value;
    } else if (field === "input") {
      tokens.inputTokens = value;
    } else if (field === "cacheWrite") {
      tokens.cacheWriteTokens = value;
    } else if (field === "cacheRead") {
      tokens.cacheReadTokens = value;
    } else if (field === "output") {
      tokens.outputTokens = value;
    }
  });

  const breakdown = estimateComponentCost(entry.rates, tokens, getEstimateOpts());
  const totalEl = detailRow.querySelector("[data-calc-total]");
  if (totalEl) totalEl.textContent = formatCents(breakdown.totalCents);

  const segments = [
    { label: t("pricingInput"), value: breakdown.inputCents, color: TOKEN_COLORS.input },
    { label: t("pricingCacheWrite"), value: breakdown.cacheWriteCents, color: TOKEN_COLORS.cacheWrite },
    { label: t("pricingCacheRead"), value: breakdown.cacheReadCents, color: TOKEN_COLORS.cacheRead },
    { label: t("pricingOutput"), value: breakdown.outputCents, color: TOKEN_COLORS.output },
  ].filter((s) => s.value > 0);

  const barEl = detailRow.querySelector("[data-calc-bar]");
  const breakdownEl = detailRow.querySelector("[data-calc-breakdown]");
  if (!barEl || !breakdownEl) return;

  if (breakdown.totalCents <= 0) {
    barEl.innerHTML = "";
    breakdownEl.innerHTML = '<p class="muted small">' + escapeHtml(t("pricingCalcEmpty")) + "</p>";
    return;
  }

  barEl.innerHTML = segments.map((s) =>
    '<span class="token-bar-seg" style="width:' + ((s.value / breakdown.totalCents) * 100).toFixed(2) + '%;background:' + s.color + ';"></span>'
  ).join("");

  breakdownEl.innerHTML = segments.map((s) =>
    '<div class="pricing-calc-seg"><span class="token-dot" style="background:' + s.color + '"></span>' +
      escapeHtml(s.label) + ": " + formatCents(s.value) +
    "</div>"
  ).join("");
}
