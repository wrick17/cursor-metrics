import {
  EVENTS_PAGE_SIZES,
  local,
  paginateList,
  persistLocal,
  refs,
  ui,
  vscode,
} from "./core.js";
import { colorForModel, tintColor } from "./chart.js";
import {
  abbreviateConversationId,
  aggregateConversations,
} from "../../../src/conversation-aggregate.ts";
import {
  escapeHtml,
  eventSpendDollars,
  formatDateTime,
  formatModelLabel,
  formatPerPage,
  formatRequests,
  formatCents,
  formatTokens,
  eventRequestCount,
  eventTokenCount,
  getDurationCutoff,
  rangeNow,
} from "./format.js";
import { t } from "./i18n.js";
import { renderTable, showEventDetail, getSortedEvents, findEventByKey } from "./tables.js";

const NO_CONVERSATION_KEY = "__none__";

export function getSortedConversations() {
  if (!refs.state) return [];
  const cutoff = getDurationCutoff(local.range, refs.state.resetsAt, rangeNow());
  const rows = aggregateConversations(refs.state.events, {
    cutoff,
    usageFilter: local.usageFilter,
    titles: refs.state.conversationTitles ?? {},
    previewTitles: local.conversationPreview,
    locale: local.locale === "it" ? "it" : "en",
    noConversationLabel: t("noConversation"),
    quotaAwareEventDisplay: refs.state.quotaAwareEventDisplay !== false,
  });
  const dir = local.conversationSortOrder === "asc" ? 1 : -1;
  const key = local.conversationSortKey;
  return rows.sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === "lastTimestamp" || key === "firstTimestamp") {
      av = Number(av);
      bv = Number(bv);
    } else if (key === "models") {
      av = a.modelsLabel;
      bv = b.modelsLabel;
    }
    const an = typeof av === "number" ? av : Number(av);
    const bn = typeof bv === "number" ? bv : Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

function renderConversationRow(row) {
  const color = colorForModel(row.models[0] || "default");
  const rowStyle = "background:" + tintColor(color, 0.10) + ";box-shadow:inset 3px 0 0 " + color + ";";
  const idKey = row.conversationId ?? NO_CONVERSATION_KEY;
  const selected = refs.selectedConversationId === idKey ? " selected" : "";
  const subtitle = row.conversationId && local.conversationPreview && row.title
    ? '<div class="muted small">' + escapeHtml(abbreviateConversationId(row.conversationId)) + "</div>"
    : "";
  return '<tr class="conversation-row conversation-row-clickable' + selected + '" data-conversation-id="' + escapeHtml(idKey) + '" style="' + rowStyle + '" title="' + escapeHtml(t("convClickEvent")) + '">' +
    "<td><strong>" + escapeHtml(row.label) + "</strong>" + subtitle + "</td>" +
    "<td>" + formatDateTime(row.lastTimestamp) + "</td>" +
    "<td>" + escapeHtml(row.modelsLabel) + "</td>" +
    '<td class="num">' + row.eventCount.toLocaleString() + "</td>" +
    '<td class="num">' + formatTokens(row.totalTokens) + "</td>" +
    '<td class="num">' + formatRequests(row.requests) + "</td>" +
    '<td class="num">' + formatCents(row.spendCents) + "</td>" +
  "</tr>";
}

function renderConversationsPagination(paged) {
  if (!ui.conversationsPagination) return;
  if (paged.totalItems === 0) {
    ui.conversationsPagination.innerHTML = "";
    return;
  }

  const showingStart = paged.startIndex + 1;
  const showingEnd = paged.endIndex;
  const sizeOptions = EVENTS_PAGE_SIZES.map((size) =>
    '<option value="' + size + '"' + (size === local.conversationsPageSize ? " selected" : "") + ">" + formatPerPage(size) + "</option>"
  ).join("");
  const atFirst = paged.page <= 1;
  const atLast = paged.page >= paged.totalPages;

  ui.conversationsPagination.innerHTML =
    '<span class="pagination-info">' + t("showing") + " " +
      showingStart.toLocaleString() + "\u2013" + showingEnd.toLocaleString() +
      " " + t("of") + " " + paged.totalItems.toLocaleString() + " " + (paged.totalItems === 1 ? t("conversationOne") : t("conversationMany")) +
    "</span>" +
    '<div class="pagination-controls">' +
      '<select id="conversations-page-size" class="pagination-size" aria-label="' + escapeHtml(t("conversationsPerPage")) + '">' + sizeOptions + "</select>" +
      '<button type="button" data-action="first"' + (atFirst ? " disabled" : "") + ' aria-label="First page">\u00ab</button>' +
      '<button type="button" data-action="prev"' + (atFirst ? " disabled" : "") + ' aria-label="Previous page">\u2039</button>' +
      '<span class="pagination-page">' + paged.page + " / " + paged.totalPages + "</span>" +
      '<button type="button" data-action="next"' + (atLast ? " disabled" : "") + ' aria-label="Next page">\u203a</button>' +
      '<button type="button" data-action="last"' + (atLast ? " disabled" : "") + ' aria-label="Last page">\u00bb</button>' +
    "</div>";
}

export function renderConversationsTable() {
  if (!ui.conversationsBody) return;
  const rows = getSortedConversations();
  const paged = paginateList(rows, local.conversationsPage, local.conversationsPageSize);

  if (paged.page !== local.conversationsPage) {
    local.conversationsPage = paged.page;
    persistLocal();
  }

  if (ui.conversationsHead) {
    ui.conversationsHead.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === local.conversationSortKey) {
        th.classList.add(local.conversationSortOrder === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });
  }

  if (rows.length === 0) {
    ui.conversationsBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px;" class="muted">' + t("noConversationsInRange") + "</td></tr>";
    if (ui.conversationsPagination) ui.conversationsPagination.innerHTML = "";
    return;
  }

  ui.conversationsBody.innerHTML = paged.items.map((row) => renderConversationRow(row)).join("");
  renderConversationsPagination(paged);
}

export function updatePreviewLoading(on) {
  if (!ui.conversationPreviewBtn) return;
  ui.conversationPreviewBtn.disabled = !!on;
  ui.conversationPreviewBtn.textContent = on ? t("previewLoading") : t("previewTitles");
}

export function updatePreviewStatus(msg) {
  if (!ui.previewStatus) return;
  const show = msg?.enabled && local.activityTab === "conversations";
  if (!show) {
    ui.previewStatus.classList.add("hidden");
    ui.previewStatus.textContent = "";
    return;
  }
  ui.previewStatus.classList.remove("hidden");
  if (msg.error) {
    ui.previewStatus.textContent = t("previewError");
    return;
  }
  const conv = Number(msg.conversationCount) || 0;
  const titles = Number(msg.titleCount) || 0;
  if (titles === 0) {
    ui.previewStatus.textContent = t("previewNoTitles").replace("{conv}", conv.toLocaleString());
  } else {
    ui.previewStatus.textContent = t("previewFound")
      .replace("{titles}", titles.toLocaleString())
      .replace("{conv}", conv.toLocaleString());
  }
}

export function applyConversationMessages(conversationId, messages, error) {
  if (!ui.eventDetailBody || !conversationId) return;
  const idKey = conversationId;
  if (refs.selectedConversationId !== idKey) return;

  const container = ui.eventDetailBody.querySelector("#conversation-messages-list");
  const section = ui.eventDetailBody.querySelector("#conversation-messages-section");
  if (!container || !section) return;

  section.querySelector(".conv-messages-loading")?.remove();

  if (error) {
    container.innerHTML = '<p class="muted small">' + escapeHtml(t("convMessagesError")) + "</p>";
    return;
  }

  if (!messages?.length) {
    container.innerHTML = '<p class="muted small">' + escapeHtml(t("convMessagesEmpty")) + "</p>";
    return;
  }

  container.innerHTML = messages.map((msg) => {
    const roleLabel = msg.role === "user" ? t("msgRoleUser") : t("msgRoleAssistant");
    const time = msg.createdAt ? formatDateTime(msg.createdAt) : "";
    const modelLabel = msg.model ? formatModelLabel(msg.model) : "";
    const modelTitle = msg.modelEstimated ? t("msgModelEstimated") : t("colModel");
    const modelHtml = modelLabel
      ? '<span class="conv-message-model' + (msg.modelEstimated ? " estimated" : "") + '" title="' + escapeHtml(modelTitle) + '">' + escapeHtml(modelLabel) + "</span>"
      : "";
    return '<article class="conv-message conv-message-' + escapeHtml(msg.role) + '">' +
      '<header class="conv-message-header"><div class="conv-message-meta"><strong>' + escapeHtml(roleLabel) + "</strong>" + modelHtml + "</div>" +
      (time ? '<span class="muted small">' + escapeHtml(time) + "</span>" : "") +
      "</header>" +
      '<div class="conv-message-text">' + escapeHtml(msg.text) + "</div>" +
    "</article>";
  }).join("");
}

export function showConversationDetail(row) {
  if (!ui.eventDetailOverlay || !ui.eventDetailBody || !row) return;
  refs.selectedConversationId = row.conversationId ?? NO_CONVERSATION_KEY;
  refs.selectedEventKey = null;
  renderConversationsTable();

  ui.eventDetailTitle.textContent = row.label;
  const rangeText = formatDateTime(row.firstTimestamp) + " \u2013 " + formatDateTime(row.lastTimestamp);
  const idLine = row.conversationId
    ? abbreviateConversationId(row.conversationId)
    : t("noConversation");
  ui.eventDetailSubtitle.textContent = idLine + " \u00b7 " + rangeText;

  const eventRows = row.events.map((event) => {
    const color = colorForModel(event.model || "default");
    const eventKey = event.eventKey ?? "";
    return '<tr class="conversation-event-row" data-detail-event-key="' + escapeHtml(eventKey) + '" style="box-shadow:inset 3px 0 0 ' + color + ';">' +
      "<td>" + formatDateTime(event.timestamp) + "</td>" +
      "<td>" + escapeHtml(formatModelLabel(event.model)) + "</td>" +
      "<td>" + escapeHtml(event.kind) + "</td>" +
      '<td class="num">' + formatTokens(eventTokenCount(event)) + "</td>" +
      '<td class="num">' + formatRequests(eventRequestCount(event)) + "</td>" +
      '<td class="num">' + formatCents(Math.round(eventSpendDollars(event) * 100)) + "</td>" +
    "</tr>";
  }).join("");

  const messagesSection = row.conversationId
    ? '<div class="event-detail-section" id="conversation-messages-section"><h3>' + escapeHtml(t("convMessages")) +
      '</h3><p class="muted small conv-messages-loading">' + escapeHtml(t("convMessagesLoading")) +
      '</p><div id="conversation-messages-list" class="conversation-messages-list"></div></div>'
    : "";

  ui.eventDetailBody.innerHTML =
    '<div class="event-detail-grid">' +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("convFirstActive")) + '</span><span class="value">' + formatDateTime(row.firstTimestamp) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("convLastActive")) + '</span><span class="value">' + formatDateTime(row.lastTimestamp) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("colCalls")) + '</span><span class="value">' + row.eventCount.toLocaleString() + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("colTokens")) + '</span><span class="value">' + formatTokens(row.totalTokens) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("colRequests")) + '</span><span class="value">' + formatRequests(row.requests) + "</span></div>" +
      '<div class="event-detail-stat"><span class="label">' + escapeHtml(t("colSpend")) + '</span><span class="value">' + formatCents(row.spendCents) + "</span></div>" +
    "</div>" +
    '<div class="event-detail-section"><h3>' + escapeHtml(t("colModels")) + "</h3><p>" + escapeHtml(row.modelsLabel) + "</p></div>" +
    messagesSection +
    '<div class="event-detail-section"><h3>' + escapeHtml(t("convEventList")) + '</h3><p class="muted small">' + escapeHtml(t("convClickEvent")) + "</p>" +
    '<table class="detail-events-table"><thead><tr>' +
      "<th>" + escapeHtml(t("colDate")) + "</th>" +
      "<th>" + escapeHtml(t("colModel")) + "</th>" +
      "<th>" + escapeHtml(t("colType")) + "</th>" +
      "<th class=\"num\">" + escapeHtml(t("colTokens")) + "</th>" +
      "<th class=\"num\">" + escapeHtml(t("colRequests")) + "</th>" +
      "<th class=\"num\">" + escapeHtml(t("colSpend")) + "</th>" +
    "</tr></thead><tbody>" + eventRows + "</tbody></table></div>";

  ui.eventDetailOverlay.classList.remove("hidden");
  ui.eventDetailOverlay.setAttribute("aria-hidden", "false");
  ui.eventDetailClose?.removeAttribute("tabindex");
  ui.eventDetailClose?.focus();

  if (row.conversationId) {
    vscode.postMessage({ type: "getConversationMessages", conversationId: row.conversationId });
  }
}

export function closeConversationDetail() {
  refs.selectedConversationId = null;
  renderConversationsTable();
}

export function syncDashboardPrefs() {
  vscode.postMessage({
    type: "syncDashboardPrefs",
    range: local.range,
    usageFilter: local.usageFilter,
  });
}

export function updateArchiveNote() {
  if (!ui.archiveNote || !refs.state) return;
  const count = refs.state.storedEventCount || 0;
  const parts = [];
  if (count > 0) {
    parts.push(t("archiveNote").replace("{count}", count.toLocaleString()));
  }
  if (refs.state.eventsComplete === false) {
    parts.push(t("archivePartialSync"));
  }
  if (parts.length > 0) {
    ui.archiveNote.textContent = parts.join(" · ");
    ui.archiveNote.classList.remove("hidden");
  } else {
    ui.archiveNote.classList.add("hidden");
  }
}

export function applyActivityTab() {
  const isEvents = local.activityTab === "events";
  ui.activityTabs?.forEach((btn) => {
    const active = btn.dataset.activityTab === local.activityTab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  ui.eventsPanel?.classList.toggle("hidden", !isEvents);
  ui.conversationsPanel?.classList.toggle("hidden", isEvents);
  ui.exportBtn?.classList.toggle("hidden", !isEvents);
  ui.conversationPreviewBtn?.classList.toggle("hidden", isEvents);
  ui.previewStatus?.classList.toggle("hidden", isEvents || !local.conversationPreview);
  if (ui.conversationPreviewBtn) {
    ui.conversationPreviewBtn.classList.toggle("active", local.conversationPreview);
    ui.conversationPreviewBtn.setAttribute("aria-pressed", local.conversationPreview ? "true" : "false");
  }
  if (ui.activitySectionTitle) {
    ui.activitySectionTitle.textContent = isEvents ? t("sectionEvents") : t("sectionConversations");
  }
  if (ui.activitySectionToggle) {
    ui.activitySectionToggle.setAttribute(
      "aria-label",
      isEvents ? t("toggleEvents") : t("toggleConversations"),
    );
  }
}

export function bindConversationHandlers(vscode) {
  ui.activityTabs?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.activityTab;
      if (!next || next === local.activityTab) return;
      local.activityTab = next;
      persistLocal();
      applyActivityTab();
      if (next === "conversations") renderConversationsTable();
      else renderTable();
    });
  });

  ui.conversationPreviewBtn?.addEventListener("click", () => {
    local.conversationPreview = !local.conversationPreview;
    persistLocal();
    applyActivityTab();
    updatePreviewLoading(true);
    renderConversationsTable();
    vscode.postMessage({ type: "setConversationPreview", enabled: local.conversationPreview });
  });

  ui.conversationsBody?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-conversation-id]");
    if (!tr) return;
    const id = tr.dataset.conversationId;
    const row = getSortedConversations().find((r) => (r.conversationId ?? NO_CONVERSATION_KEY) === id);
    if (row) showConversationDetail(row);
  });

  ui.eventDetailBody?.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-detail-event-key]");
    if (!tr) return;
    const eventKey = tr.dataset.detailEventKey;
    const event = findEventByKey(getSortedEvents(), eventKey);
    if (!event) return;
    showEventDetail(event);
  });

  ui.conversationsHead?.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (local.conversationSortKey === key) {
      local.conversationSortOrder = local.conversationSortOrder === "asc" ? "desc" : "asc";
    } else {
      local.conversationSortKey = key;
      local.conversationSortOrder = key === "label" || key === "models" ? "asc" : "desc";
    }
    local.conversationsPage = 1;
    persistLocal();
    renderConversationsTable();
  });

  ui.conversationsPagination?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    const rows = getSortedConversations();
    const current = paginateList(rows, local.conversationsPage, local.conversationsPageSize);
    const action = btn.dataset.action;
    if (action === "first") local.conversationsPage = 1;
    else if (action === "prev") local.conversationsPage = Math.max(1, current.page - 1);
    else if (action === "next") local.conversationsPage = Math.min(current.totalPages, current.page + 1);
    else if (action === "last") local.conversationsPage = current.totalPages;
    else return;
    persistLocal();
    renderConversationsTable();
  });

  ui.conversationsPagination?.addEventListener("change", (e) => {
    if (e.target.id !== "conversations-page-size") return;
    const nextSize = Number(e.target.value);
    if (!EVENTS_PAGE_SIZES.includes(nextSize) || nextSize === local.conversationsPageSize) return;
    local.conversationsPageSize = nextSize;
    local.conversationsPage = 1;
    persistLocal();
    renderConversationsTable();
  });
}
