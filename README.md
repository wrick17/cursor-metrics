# Cursor Usage

Shows your Cursor IDE usage directly in the status bar. Displays included request count and on-demand spend at a glance.

## Features

- **Status bar**: Compact usage display -- `500/500 | $2.76/$200`
- **Rich tooltip**: Hover for a full breakdown with SVG progress bars and reset countdown
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

## How it works

The extension reads your Cursor session token from the local SQLite database and fetches usage data from Cursor's APIs. No API key, manual configuration, or cookie embezzlement required -- just sign in to Cursor.

Usage data refreshes automatically when you edit files (debounced at 30 seconds) or return focus to the window, with a cooldown based on your `pollInterval` setting. No API calls are made while the editor is idle.

## License

MIT
