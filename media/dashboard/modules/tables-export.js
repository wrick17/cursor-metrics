import { local, refs, ui } from "./core.js";
import {
  eventSpendDollars,
  eventRequestCount,
  eventTokenCount,
  formatModelLabel,
  getActiveCurrency,
  isIncludedEvent,
  isOnDemandEvent,
  toCsvMoney,
  toMillis,
  tokenField,
} from "./format.js";
import { getSortedEvents } from "./tables-events.js";

function csvCell(v) {
  const s = String(v);
  const safe = /^\s*[=+\-@]/.test(s) ? "'" + s : s;
  if (/[",\n]/.test(safe)) return '"' + safe.replace(/"/g, '""') + '"';
  return safe;
}

export function exportCsv() {
  const events = getSortedEvents();
  const spendCol = getActiveCurrency() === "eur" ? "SpendEUR" : "SpendUSD";
  const tokenCostCol = getActiveCurrency() === "eur" ? "TokenCostEUR" : "TokenCostUSD";
  const feeCol = getActiveCurrency() === "eur" ? "CursorFeeEUR" : "CursorFeeUSD";
  const header = ["Date", "Type", "Model", "MaxMode", "Tokens", "InputTokens", "OutputTokens", "CacheWrite", "CacheRead", "Requests", spendCol, tokenCostCol, feeCol];
  const lines = [header.join(",")];
  for (const e of events) {
    const ts = toMillis(e.timestamp);
    const dateStr = Number.isFinite(ts) ? new Date(ts).toISOString() : "";
    const row = [
      dateStr,
      e.kind,
      formatModelLabel(e.model),
      e.maxMode ? "true" : "false",
      eventTokenCount(e),
      tokenField(e, "inputTokens"),
      tokenField(e, "outputTokens"),
      tokenField(e, "cacheWriteTokens"),
      tokenField(e, "cacheReadTokens"),
      refs.state && refs.state.quotaAwareEventDisplay && !isIncludedEvent(e) ? "" : eventRequestCount(e),
      refs.state && refs.state.quotaAwareEventDisplay && !isOnDemandEvent(e) ? "" : toCsvMoney(eventSpendDollars(e)),
      toCsvMoney((e.tokenCostCents || 0) / 100),
      toCsvMoney((e.cursorTokenFee || 0) / 100),
    ].map(csvCell).join(",");
    lines.push(row);
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cursor-usage-" + local.range + "-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function applyTeamMemberConstraints() {
  // Reserved for plan-specific chart/table constraints.
}

export function showError(msg) {
  if (msg) {
    ui.errorBanner.textContent = msg;
    ui.errorBanner.classList.remove("hidden");
  } else {
    ui.errorBanner.classList.add("hidden");
  }
}

export function showWarnings(warnings) {
  if (!ui.warningBanner) return;
  const list = Array.isArray(warnings) ? warnings.filter((w) => typeof w === "string" && w.length > 0) : [];
  if (list.length > 0) {
    ui.warningBanner.textContent = list.join("\n");
    ui.warningBanner.classList.remove("hidden");
  } else {
    ui.warningBanner.textContent = "";
    ui.warningBanner.classList.add("hidden");
  }
}
