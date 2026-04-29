import * as vscode from "vscode";
import type { DashboardState } from "./dashboard-state";

export const OPEN_DASHBOARD_COMMAND = "cursor-usage.openDashboard";

type RefreshFn = () => Promise<void>;
type StateProvider = () => DashboardState | null;

function makeNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export class DashboardPanel {
  static currentPanel: DashboardPanel | undefined;

  static createOrShow(
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
  ): DashboardPanel {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "cursorUsageDashboard",
      "Cursor Usage",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, context, onRefresh, getState);
    return DashboardPanel.currentPanel;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    onRefresh: RefreshFn,
    getState: StateProvider,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.renderHtml(panel.webview, context.extensionUri);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "ready") {
          const state = getState();
          if (state) this.postState(state);
        } else if (msg.type === "refresh") {
          this.postLoading(true);
          try {
            await onRefresh();
          } finally {
            this.postLoading(false);
          }
        }
      },
      null,
      this.disposables,
    );
  }

  postState(state: DashboardState): void {
    this.panel.webview.postMessage({ type: "state", state });
  }

  postLoading(on: boolean): void {
    this.panel.webview.postMessage({ type: "loading", on });
  }

  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }

  private renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "dashboard", file));

    const cssUri = mediaUri("dashboard.css");
    const jsUri = mediaUri("dashboard.js");
    const chartUri = mediaUri("chart.umd.js");
    const nonce = makeNonce();
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cursor Usage</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <header class="dashboard-header">
    <h1>Cursor Usage</h1>
    <div class="header-actions">
      <span id="last-updated" class="muted"></span>
      <button id="refresh-btn" type="button">Refresh</button>
    </div>
  </header>

  <section class="summary-cards" id="summary-cards"></section>

  <section class="controls">
    <div class="range-selector" id="range-selector" role="tablist">
      <button data-range="1d" type="button">Last 24 hours</button>
      <button data-range="7d" type="button">Last 7 days</button>
      <button data-range="30d" type="button">Last 30 days</button>
      <button data-range="billingCycle" type="button">Current Billing Cycle</button>
    </div>
  </section>

  <section class="chart-section">
    <div class="chart-header">
      <div>
        <h2>Your Usage</h2>
        <p class="muted">Per-day usage over the selected range</p>
      </div>
      <div class="chart-filters">
        <label>Usage:
          <select id="usage-filter">
            <option value="all">All</option>
            <option value="included">Included</option>
            <option value="ondemand">On-Demand</option>
          </select>
        </label>
        <label>Metric:
          <select id="metric-filter">
            <option value="spend">Spend</option>
            <option value="tokens" selected>Tokens</option>
            <option value="requests">Requests</option>
          </select>
        </label>
      </div>
    </div>
    <div class="chart-wrapper">
      <canvas id="usage-chart"></canvas>
    </div>
    <p id="chart-note" class="muted small"></p>
  </section>

  <section class="events-section">
    <div class="events-header">
      <h2>Events</h2>
      <button id="export-csv" type="button">Export CSV</button>
    </div>
    <div class="table-scroll">
      <table id="events-table">
        <thead>
          <tr>
            <th data-sort="timestamp" class="sortable">Date</th>
            <th data-sort="kind" class="sortable">Type</th>
            <th data-sort="model" class="sortable">Model</th>
            <th data-sort="totalTokens" class="sortable num">Tokens</th>
            <th data-sort="requests" class="sortable num">Requests</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="pagination" id="pagination"></div>
  </section>

  <div id="error-banner" class="error-banner hidden"></div>

  <script nonce="${nonce}" src="${chartUri}"></script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
