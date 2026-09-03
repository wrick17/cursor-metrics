import {
  EVENTS_PAGE_SIZES,
  local,
  paginateList,
  persistLocal,
  refs,
  ui,
} from "./core.js";
import { colorForModel, tintColor } from "./chart.js";
import {
  escapeHtml,
  eventRequestsText,
  eventSpendText,
  eventTokenCount,
  formatDateTime,
  formatModelLabel,
  formatPerPage,
  formatTokens,
  getDurationCutoff,
  matchesUsageFilter,
  rangeNow,
  toMillis,
} from "./format.js";
import { t } from "./i18n.js";

export function findEventByKey(events, eventKey) {
  if (!eventKey) return null;
  return events.find((event) => event.eventKey === eventKey) ?? null;
}

export function getSortedEvents() {
  if (!refs.state) return [];
  const cutoff = getDurationCutoff(local.range, refs.state.resetsAt, rangeNow());
  const events = refs.state.events.filter((e) => {
    const ts = toMillis(e.timestamp);
    return Number.isFinite(ts) && ts >= cutoff && matchesUsageFilter(e, local.usageFilter);
  });
  const dir = local.sortOrder === "asc" ? 1 : -1;
  const key = local.sortKey;
  return events.slice().sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === "timestamp") { av = toMillis(av); bv = toMillis(bv); }
    const an = typeof av === "number" ? av : Number(av);
    const bn = typeof bv === "number" ? bv : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function renderEventRow(e, eventIdx) {
  const maxBadge = e.maxMode ? ' <span class="max-badge">MAX</span>' : "";
  const color = colorForModel(e.model);
  const rowStyle = 'background:' + tintColor(color, 0.10) + ';box-shadow:inset 3px 0 0 ' + color + ';';
  const eventKey = e.eventKey ?? "";
  const selected = refs.selectedEventKey === eventKey ? " event-row-selected" : "";
  return '<tr class="event-row-clickable' + selected + '" data-event-key="' + escapeHtml(eventKey) + '" data-event-idx="' + eventIdx + '" style="' + rowStyle + '" title="Click for token breakdown">' +
    "<td>" + formatDateTime(e.timestamp) + "</td>" +
    '<td><span class="kind-badge kind-' + e.kind.replace(/[^A-Za-z]/g, "") + '">' + e.kind + "</span></td>" +
    "<td>" + escapeHtml(formatModelLabel(e.model)) + maxBadge + "</td>" +
    '<td class="num">' + formatTokens(eventTokenCount(e)) + "</td>" +
    '<td class="num">' + eventRequestsText(e) + "</td>" +
    '<td class="num">' + eventSpendText(e) + "</td>" +
  "</tr>";
}

function renderPagination(paged) {
  if (paged.totalItems === 0) {
    ui.pagination.innerHTML = "";
    return;
  }

  const showingStart = paged.startIndex + 1;
  const showingEnd = paged.endIndex;
  const sizeOptions = EVENTS_PAGE_SIZES.map((size) =>
    '<option value="' + size + '"' + (size === local.eventsPageSize ? " selected" : "") + ">" + formatPerPage(size) + "</option>"
  ).join("");
  const atFirst = paged.page <= 1;
  const atLast = paged.page >= paged.totalPages;

  ui.pagination.innerHTML =
    '<span class="pagination-info">' + t("showing") + " " +
      showingStart.toLocaleString() + "\u2013" + showingEnd.toLocaleString() +
      " " + t("of") + " " + paged.totalItems.toLocaleString() + " " +
      (paged.totalItems === 1 ? t("eventOne") : t("eventMany")) +
    "</span>" +
    '<div class="pagination-controls">' +
      '<select id="events-page-size" class="pagination-size" aria-label="' + escapeHtml(t("eventsPerPage")) + '">' + sizeOptions + "</select>" +
      '<button type="button" data-action="first"' + (atFirst ? " disabled" : "") + ' aria-label="' + escapeHtml(t("pageFirst")) + '">\u00ab</button>' +
      '<button type="button" data-action="prev"' + (atFirst ? " disabled" : "") + ' aria-label="' + escapeHtml(t("pagePrev")) + '">\u2039</button>' +
      '<span class="pagination-page">' + paged.page + " / " + paged.totalPages + "</span>" +
      '<button type="button" data-action="next"' + (atLast ? " disabled" : "") + ' aria-label="' + escapeHtml(t("pageNext")) + '">\u203a</button>' +
      '<button type="button" data-action="last"' + (atLast ? " disabled" : "") + ' aria-label="' + escapeHtml(t("pageLast")) + '">\u00bb</button>' +
    "</div>";
}

export function renderTable() {
  const events = getSortedEvents();
  const paged = paginateList(events, local.eventsPage, local.eventsPageSize);

  if (paged.page !== local.eventsPage) {
    local.eventsPage = paged.page;
    persistLocal();
  }

  if (events.length === 0) {
    ui.tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px;" class="muted">' + escapeHtml(t("noEventsInRange")) + "</td></tr>";
    ui.pagination.innerHTML = "";
  } else {
    ui.tableBody.innerHTML = paged.items.map((e, i) => renderEventRow(e, paged.startIndex + i)).join("");
    renderPagination(paged);
  }

  ui.tableHead.querySelectorAll("th.sortable").forEach((th) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (th.dataset.sort === local.sortKey) {
      th.classList.add(local.sortOrder === "asc" ? "sorted-asc" : "sorted-desc");
    }
  });
}
