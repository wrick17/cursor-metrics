# cursor-usage

A VS Code / Cursor extension that shows your Cursor IDE usage directly in the status bar. Displays included request count and on-demand spend at a glance, with a rich tooltip for full details.

## Features

- **Status bar**: Compact usage display -- `500/500 | $2.76/$200`
- **Rich tooltip**: Hover for a full breakdown with progress bars and reset date
- **Click for details**: Notification with usage summary + "Open Dashboard" button
- **Auto-refresh**: Polls every 60 seconds
- **Cross-platform**: Works on macOS, Windows, and Linux

## Install

```bash
bun install
bun run build
```

Then install the extension in Cursor:

1. Run `bun run package` to create a `.vsix` file
2. In Cursor, open the command palette and run **Extensions: Install from VSIX...**
3. Select the generated `.vsix` file

Or for development, press `F5` to launch an Extension Development Host with the extension loaded.

## Commands

| Command | Description |
|---------|-------------|
| `Cursor Usage: Show Details` | Show usage notification with dashboard link |
| `Cursor Usage: Refresh` | Force-refresh usage data |

## How it works

The extension reads your Cursor session token from the local SQLite database (`state.vscdb`) and fetches usage data from Cursor's internal APIs. No API key or manual configuration required -- just sign in to Cursor.

## Development

```bash
bun run watch
```

Rebuilds on file changes. Press `F5` in Cursor to launch the Extension Development Host.
