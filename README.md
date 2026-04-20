# Cursor Usage

Shows your Cursor IDE usage directly in the status bar. Displays included request count and on-demand spend at a glance.

## Features

- **Status bar**: Compact usage display -- `500/500 | $2.76/$200`
- **Rich tooltip**: Hover for a side-by-side breakdown with SVG progress bars, reset countdown, and per-model usage table
- **Usage by model**: See tokens and requests broken down by model (e.g. `claude-4.6-opus-high-thinking`, `gpt-5.3-codex`) with a configurable range in Settings (1d, 7d, 30d, or Current Billing Cycle)
- **Loading indicator**: Spinning icon in the status bar while usage data is being fetched
- **Click for details**: Notification with usage summary + "Open Dashboard" button
- **Smart polling**: Refreshes usage data only when you're actively working (on document edits and window focus), not on a constant timer
- **Minimal mode**: Optionally show only the active metric -- premium requests or on-demand spend
- **Zero setup**: No API keys, manual configuration, or cookie embezzlement required -- just sign in to Cursor
- **Cross-platform**: Works on macOS, Windows, and Linux

## Commands

| Command | Description |
|---------|-------------|
| `Cursor Usage: Show Details` | Show usage notification with dashboard link |
| `Cursor Usage: Refresh` | Force-refresh usage data |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `cursorUsage.pollInterval` | `5` | Minimum cooldown between refreshes, in minutes (1, 5, 10, 30, or 60) |
| `cursorUsage.minimalMode` | `false` | Show only the active metric: premium requests if not exhausted, or on-demand spend if they are |
| `cursorUsage.usageDuration` | `billingCycle` | Time range for the usage-by-model breakdown (1d, 7d, 30d, or Current Billing Cycle). Falls back to `30d` when reset metadata is unavailable. |

## How it works

The extension reads your Cursor session token from the local SQLite database and fetches usage data from Cursor's APIs. No API key, manual configuration, or cookie embezzlement required -- just sign in to Cursor.

Usage data refreshes automatically when you edit files (debounced at 30 seconds) or return focus to the window, with a cooldown based on your `pollInterval` setting. No API calls are made while the editor is idle. Auth tokens and API responses are cached to avoid redundant work when multiple data sources are fetched in parallel.

## Publishing

This extension supports publishing to both Visual Studio Marketplace and Open VSX under the `wrick17` publisher.

- Open VSX package id: `cursor-usage`
- Visual Studio Marketplace package id: `cursor-usage-auto`
- Display name on both marketplaces: `Cursor Usage`

### One-time setup

1. Create or verify the `wrick17` publisher in [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage/publishers/).
2. Create an Azure DevOps PAT with `Marketplace > Manage` scope and `All accessible organizations`, then export it as `VSCE_PAT`.
3. Create an Open VSX access token and export it as `OPEN_VSX_TOKEN`.

### Commands

| Command | Description |
|---------|-------------|
| `bun run package` | Build and create `build/cursor-usage-<version>.vsix` |
| `bun run package:vsm` | Build and create `build/cursor-usage-auto-<version>.vsix` for Visual Studio Marketplace |
| `bun run publish:vsm` | Package and publish the Visual Studio Marketplace VSIX |
| `bun run publish:ovsx` | Publish the existing VSIX to Open VSX |
| `bun run publish:all` | Build/package both marketplace variants and publish them |
| `bun run release` | Alias for `bun run publish:all` |

### Typical flows

- **Publish current version to Visual Studio Marketplace only**: `bun run publish:vsm`
- **Publish a new version everywhere**: bump `version` in `package.json`, update `CHANGELOG.md`, then run `bun run release`

## License

MIT
