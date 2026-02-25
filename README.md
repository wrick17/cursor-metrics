# Cursor Usage

Shows your Cursor IDE usage directly in the status bar. Displays included request count and on-demand spend at a glance.

## Features

- **Status bar**: Compact usage display -- `500/500 | $2.76/$200`
- **Rich tooltip**: Hover for a full breakdown with progress bars and reset date
- **Click for details**: Notification with usage summary + "Open Dashboard" button
- **Auto-refresh**: Polls every 60 seconds
- **Cross-platform**: Works on macOS, Windows, and Linux

## Commands

| Command | Description |
|---------|-------------|
| `Cursor Usage: Show Details` | Show usage notification with dashboard link |
| `Cursor Usage: Refresh` | Force-refresh usage data |

## How it works

The extension reads your Cursor session token from the local SQLite database and fetches usage data from Cursor's APIs. No API key or manual configuration required -- just sign in to Cursor.

## License

MIT
