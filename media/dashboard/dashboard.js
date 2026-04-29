(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const DAY_MS = 86_400_000;

  const ui = {
    summaryCards: document.getElementById("summary-cards"),
    rangeSelector: document.getElementById("range-selector"),
    usageFilter: document.getElementById("usage-filter"),
    metricFilter: document.getElementById("metric-filter"),
    canvas: document.getElementById("usage-chart"),
    chartNote: document.getElementById("chart-note"),
    tableBody: document.querySelector("#events-table tbody"),
    tableHead: document.querySelector("#events-table thead"),
    pagination: document.getElementById("pagination"),
    refreshBtn: document.getElementById("refresh-btn"),
    exportBtn: document.getElementById("export-csv"),
    lastUpdated: document.getElementById("last-updated"),
    errorBanner: document.getElementById("error-banner"),
  };

  const persisted = vscode.getState() || {};
  const local = {
    range: persisted.range || "billingCycle",
    usageFilter: persisted.usageFilter || "all",
    metric: persisted.metric || "tokens",
    sortKey: persisted.sortKey || "timestamp",
    sortOrder: persisted.sortOrder || "desc",
  };

  let state = null;
  let chart = null;

  // Soft pastel palette that pairs with the shadcn dark surface — gentle, low-saturation
  // hues with enough contrast against the card background. Ordered so adjacent series
  // never use neighboring hues.
  const PALETTE = [
    "#9ec5fe", // sky blue
    "#b6e3c1", // mint
    "#f7c5a0", // peach
    "#d3b9f2", // lavender
    "#f5b8c5", // rose
    "#a7e0e0", // aqua
    "#f0d99b", // butter
    "#c9d4f0", // periwinkle
  ];

  function persistLocal() {
    vscode.setState({
      range: local.range,
      usageFilter: local.usageFilter,
      metric: local.metric,
      sortKey: local.sortKey,
      sortOrder: local.sortOrder,
    });
  }

  function startOfUtcDay(ts) {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function getDurationCutoff(range, resetAtIso, now) {
    if (range === "billingCycle") {
      if (!resetAtIso) return now - 31 * DAY_MS;
      const reset = new Date(resetAtIso);
      if (Number.isNaN(reset.getTime())) return now - 31 * DAY_MS;
      reset.setMonth(reset.getMonth() - 1);
      return reset.getTime();
    }
    const map = { "1d": 1, "7d": 7, "30d": 30 };
    return now - (map[range] || 30) * DAY_MS;
  }

  function matchesUsageFilter(event, filter) {
    if (filter === "all") return true;
    if (filter === "included") return event.kind === "Included";
    return event.kind === "On-Demand";
  }

  function formatTokens(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  }

  function formatDollars(n) {
    return "$" + (n || 0).toFixed(2);
  }

  function toMillis(ts) {
    if (typeof ts === "number") return ts;
    if (typeof ts === "string" && ts !== "") {
      const n = Number(ts);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }

  function formatDateTime(ts) {
    const d = new Date(toMillis(ts));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatRequests(n) {
    if (!Number.isFinite(n)) return "0";
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toFixed(1);
  }

  function formatDayLabel(dayMs) {
    return new Date(dayMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function formatResetCountdown(iso) {
    if (!iso) return "";
    const reset = new Date(iso);
    const days = Math.max(0, Math.ceil((reset.getTime() - Date.now()) / DAY_MS));
    const formatted = reset.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return "Resets in " + days + " day" + (days === 1 ? "" : "s") + " on " + formatted;
  }

  function setActiveRangeButton() {
    ui.rangeSelector.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.range === local.range);
    });
  }

  function renderSummaryCards() {
    if (!state || !state.data) {
      ui.summaryCards.innerHTML = '<div class="card"><div class="card-label">No data yet</div></div>';
      return;
    }
    const { includedRequests, onDemand } = state.data;
    const reqRatio = includedRequests.limit > 0 ? Math.min(1, includedRequests.used / includedRequests.limit) : 0;
    const reqPct = Math.round(reqRatio * 100);

    const parts = [];
    parts.push(
      '<div class="card">' +
        '<div class="card-label">Included-Request Usage</div>' +
        '<div class="card-value">' + includedRequests.used + " / " + includedRequests.limit + "</div>" +
        '<div class="progress"><div style="width:' + (reqPct) + '%"></div></div>' +
        '<div class="card-footer">' + formatResetCountdown(state.resetsAt) + "</div>" +
      "</div>"
    );

    if (onDemand.state !== "disabled") {
      let valText, footerText, ratio;
      if (onDemand.state === "unlimited") {
        valText = formatDollars(onDemand.spendDollars);
        footerText = "Unlimited";
        ratio = 0;
      } else {
        valText = formatDollars(onDemand.spendDollars) + " / " + formatDollars(onDemand.limitDollars || 0);
        ratio = onDemand.limitDollars > 0 ? Math.min(1, onDemand.spendDollars / onDemand.limitDollars) : 0;
        footerText = "Pay for extra usage beyond your plan limits";
      }
      parts.push(
        '<div class="card">' +
          '<div class="card-label">On-Demand Usage</div>' +
          '<div class="card-value">' + valText + "</div>" +
          '<div class="progress"><div style="width:' + Math.round(ratio * 100) + '%"></div></div>' +
          '<div class="card-footer">' + footerText + "</div>" +
        "</div>"
      );
    }
    ui.summaryCards.innerHTML = parts.join("");
  }

  function buildChartSeries() {
    const cutoff = getDurationCutoff(local.range, state.resetsAt, state.generatedAt);
    const start = startOfUtcDay(cutoff);
    const end = startOfUtcDay(state.generatedAt);
    const days = [];
    for (let d = start; d <= end; d += DAY_MS) days.push(d);
    if (days.length === 0) days.push(end);
    const dayIndex = new Map(days.map((d, i) => [d, i]));

    const perModel = new Map();
    const ensureModel = (m) => {
      let arr = perModel.get(m);
      if (!arr) {
        arr = new Array(days.length).fill(0);
        perModel.set(m, arr);
      }
      return arr;
    };

    for (const e of state.events) {
      const ts = toMillis(e.timestamp);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (!matchesUsageFilter(e, local.usageFilter)) continue;
      const day = startOfUtcDay(ts);
      const idx = dayIndex.get(day);
      if (idx === undefined) continue;
      const value =
        local.metric === "tokens" ? (e.totalTokens || 0) :
        local.metric === "requests" ? (e.requests || 0) :
        ((e.spendCents || 0) / 100);
      ensureModel(e.model)[idx] += value;
    }

    const datasets = [];
    for (const [model, arr] of perModel.entries()) {
      datasets.push({ model, data: arr.slice(), total: arr.reduce((a, b) => a + b, 0) });
    }
    // Sort by total over the range, descending — biggest contributor first.
    datasets.sort((a, b) => b.total - a.total);

    return { labels: days.map(formatDayLabel), datasets };
  }

  // Shared model→color map. Built from the current chart series so the table
  // and the chart always agree on which color belongs to which model.
  let modelColorMap = new Map();

  function rebuildModelColorMap(series) {
    modelColorMap = new Map();
    series.datasets.forEach((d, i) => {
      modelColorMap.set(d.model, PALETTE[i % PALETTE.length]);
    });
  }

  function colorForModel(model) {
    return modelColorMap.get(model) || "rgba(255,255,255,0.4)";
  }

  function renderChart() {
    const series = buildChartSeries();
    rebuildModelColorMap(series);
    const isSpend = local.metric === "spend";
    const yLabel = isSpend ? "Spend" : local.metric === "tokens" ? "Tokens" : "Requests";

    // For each x (day), find the topmost non-zero dataset so we only round
    // that segment's top corners. Datasets stack in order, so the "top" is
    // the LAST non-zero dataset at that x.
    const numX = series.labels.length;
    const topDatasetForX = new Array(numX).fill(-1);
    for (let i = 0; i < series.datasets.length; i++) {
      const data = series.datasets[i].data;
      for (let x = 0; x < numX; x++) {
        if ((data[x] || 0) > 0) topDatasetForX[x] = i;
      }
    }

    const RADIUS = 4;
    const chartData = {
      labels: series.labels,
      datasets: series.datasets.map((d, i) => ({
        label: d.model,
        data: d.data,
        backgroundColor: PALETTE[i % PALETTE.length],
        borderColor: PALETTE[i % PALETTE.length],
        borderWidth: 0,
        borderSkipped: false,
        borderRadius: (ctx) => {
          const x = ctx.dataIndex;
          const v = ctx.parsed && typeof ctx.parsed.y === "number" ? ctx.parsed.y : 0;
          if (v <= 0) return 0;
          if (topDatasetForX[x] !== i) return 0;
          // Round only the top corners of the top segment.
          return { topLeft: RADIUS, topRight: RADIUS, bottomLeft: 0, bottomRight: 0 };
        },
        categoryPercentage: 0.7,
        barPercentage: 0.85,
      })),
    };

    const styles = getComputedStyle(document.body);
    const muted = styles.getPropertyValue("--muted").trim() || "rgba(255,255,255,0.55)";
    const grid = styles.getPropertyValue("--border").trim() || "rgba(255,255,255,0.06)";

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 4, bottom: 0, left: 0 } },
      plugins: {
        legend: {
          position: "bottom",
          align: "start",
          labels: {
            color: muted,
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 11 },
            padding: 12,
          },
        },
        tooltip: {
          itemSort: (a, b) => (b.parsed.y || 0) - (a.parsed.y || 0),
          filter: (item) => (item.parsed.y || 0) > 0,
          backgroundColor: "rgba(20,20,20,0.96)",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1,
          padding: 10,
          titleColor: "rgba(255,255,255,0.95)",
          bodyColor: "rgba(255,255,255,0.85)",
          titleFont: { size: 11, weight: "600" },
          bodyFont: { size: 11 },
          boxPadding: 4,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y || 0;
              const formatted = isSpend ? formatDollars(v) : local.metric === "tokens" ? formatTokens(v) : v.toLocaleString();
              return ctx.dataset.label + ": " + formatted;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: muted, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
          grid: { display: false, drawBorder: false },
          border: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            color: muted,
            font: { size: 10 },
            callback: (v) => isSpend ? formatDollars(v) : local.metric === "tokens" ? formatTokens(v) : v.toLocaleString(),
          },
          grid: { color: grid, drawBorder: false, drawTicks: false },
          border: { display: false },
          title: { display: false, text: yLabel },
        },
      },
    };

    // Recreate chart when switching type isn't supported in-place.
    if (chart) {
      chart.destroy();
      chart = null;
    }
    chart = new Chart(ui.canvas.getContext("2d"), { type: "bar", data: chartData, options: opts });

    ui.chartNote.textContent = "";
  }

  function getFilteredEvents() {
    if (!state) return [];
    const cutoff = getDurationCutoff(local.range, state.resetsAt, state.generatedAt);
    return state.events.filter((e) => {
      const ts = toMillis(e.timestamp);
      return Number.isFinite(ts) && ts >= cutoff && matchesUsageFilter(e, local.usageFilter);
    });
  }

  function getSortedEvents() {
    const events = getFilteredEvents();
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

  function renderTable() {
    const events = getSortedEvents();

    if (events.length === 0) {
      ui.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px;" class="muted">No events in this range</td></tr>';
    } else {
      ui.tableBody.innerHTML = events.map((e) => {
        const maxBadge = e.maxMode ? ' <span class="max-badge">MAX</span>' : "";
        const dot = '<span class="model-dot" style="background:' + colorForModel(e.model) + '"></span>';
        return "<tr>" +
          "<td>" + formatDateTime(e.timestamp) + "</td>" +
          '<td><span class="kind-badge kind-' + e.kind.replace(/[^A-Za-z]/g, "") + '">' + e.kind + "</span></td>" +
          '<td><span class="model-cell">' + dot + escapeHtml(e.model) + "</span>" + maxBadge + "</td>" +
          '<td class="num">' + formatTokens(e.totalTokens || 0) + "</td>" +
          '<td class="num">' + formatRequests(e.requests || 0) + "</td>" +
        "</tr>";
      }).join("");
    }

    ui.tableHead.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.remove("sorted-asc", "sorted-desc");
      if (th.dataset.sort === local.sortKey) {
        th.classList.add(local.sortOrder === "asc" ? "sorted-asc" : "sorted-desc");
      }
    });

    if (events.length > 0) {
      ui.pagination.innerHTML = '<span class="muted">' + events.length + ' event' + (events.length === 1 ? '' : 's') + '</span>';
    } else {
      ui.pagination.innerHTML = "";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function exportCsv() {
    const events = getSortedEvents();
    const header = ["Date", "Type", "Model", "MaxMode", "Tokens", "Requests", "SpendUSD"];
    const lines = [header.join(",")];
    for (const e of events) {
      const ts = toMillis(e.timestamp);
      const dateStr = Number.isFinite(ts) ? new Date(ts).toISOString() : "";
      const row = [
        dateStr,
        e.kind,
        e.model,
        e.maxMode ? "true" : "false",
        e.totalTokens || 0,
        e.requests || 0,
        ((e.spendCents || 0) / 100).toFixed(4),
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

  function csvCell(v) {
    const s = String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function applyTeamMemberConstraints() {
    // Spend now derives from per-event chargedCents and is available for both solo and team users.
    const spendOpt = ui.metricFilter.querySelector('option[value="spend"]');
    if (spendOpt) spendOpt.disabled = false;
  }

  function showError(msg) {
    if (msg) {
      ui.errorBanner.textContent = msg;
      ui.errorBanner.classList.remove("hidden");
    } else {
      ui.errorBanner.classList.add("hidden");
    }
  }

  function renderAll() {
    if (!state) return;
    setActiveRangeButton();
    ui.usageFilter.value = local.usageFilter;
    ui.metricFilter.value = local.metric;
    applyTeamMemberConstraints();
    renderSummaryCards();
    renderChart();
    renderTable();
    showError(state.error);
    ui.lastUpdated.textContent = "Updated " + new Date(state.generatedAt).toLocaleTimeString();
  }

  // Event wiring
  ui.rangeSelector.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    local.range = btn.dataset.range;
    persistLocal();
    renderAll();
  });

  ui.usageFilter.addEventListener("change", () => {
    local.usageFilter = ui.usageFilter.value;
    persistLocal();
    renderChart();
    renderTable();
  });

  ui.metricFilter.addEventListener("change", () => {
    local.metric = ui.metricFilter.value;
    persistLocal();
    renderChart();
  });

  ui.tableHead.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (!th) return;
    const key = th.dataset.sort;
    if (local.sortKey === key) {
      local.sortOrder = local.sortOrder === "asc" ? "desc" : "asc";
    } else {
      local.sortKey = key;
      local.sortOrder = key === "model" || key === "kind" ? "asc" : "desc";
    }
    persistLocal();
    renderTable();
  });

  ui.refreshBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "refresh" });
  });

  ui.exportBtn.addEventListener("click", exportCsv);

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "state") {
      state = msg.state;
      renderAll();
    } else if (msg.type === "loading") {
      ui.refreshBtn.disabled = !!msg.on;
      ui.refreshBtn.textContent = msg.on ? "Refreshing…" : "Refresh";
    }
  });

  // Tell host we're ready
  vscode.postMessage({ type: "ready" });
})();
