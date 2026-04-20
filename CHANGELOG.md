# Changelog

All notable changes to this project are documented in this file.

## [0.4.6] - 2026-04-20

### Changed
- Backfilled changelog entries for every release from `0.1.0` through `0.4.5`.
- Added the missing `0.4.4` changelog entry based on git history.

## [0.4.5] - 2026-04-20

### Added
- Added a `Current Billing Cycle` range option in the tooltip range picker when reset metadata is available.
- Added duration option helpers and tests covering picker visibility and fallback behavior.

### Changed
- Switched range selection from settings navigation to an in-tooltip QuickPick command.
- Persisted selected range in extension global state while still seeding from the legacy `cursorUsage.usageDuration` setting.
- Updated usage aggregation to support billing-cycle cutoffs derived from `resetsAt`.
- Expanded usage event and daily spend fetch windows from 30 to 31 days to cover longer billing cycles.
- Updated README to describe the new picker flow and legacy-setting migration behavior.

## [0.4.4] - 2026-04-20

### Added
- Added a per-model spend breakdown to the tooltip.

## [0.4.3] - 2026-04-15

### Added
- Added limited on-demand spend cap details to the tooltip.

## [0.4.2] - 2026-03-26

### Changed
- Polished the usage tooltip layout.

## [0.4.1] - 2026-03-16

### Changed
- Aligned dashboard usage mapping with tooltip totals and unlimited spend display.
- Routed packaged VSIX artifacts to the `build/` directory for packaging and release workflows.

## [0.4.0] - 2026-02-26

### Added
- Added a per-model usage breakdown in the tooltip.
- Added a `cursorUsage.usageDuration` setting to control the usage breakdown time range.

### Changed
- Reworked the tooltip into a side-by-side layout for usage details.

## [0.3.3] - 2026-02-26

### Changed
- Made progress bars theme-aware for light and dark modes.

## [0.3.2] - 2026-02-25

### Added
- Added an extension icon.

## [0.3.1] - 2026-02-25

### Changed
- Updated README to reflect the current feature set, settings, and smart polling behavior.

## [0.3.0] - 2026-02-25

### Added
- Added SVG progress bars in the tooltip.
- Added a loading spinner and reset countdown state.

### Changed
- Introduced smart polling behavior for usage refreshes.

## [0.2.1] - 2026-02-25

### Changed
- Reduced API calls by caching setup data and reading the account email from the local database.

## [0.2.0] - 2026-02-25

### Added
- Added `cursorUsage.pollInterval` configuration for refresh cadence.
- Added `cursorUsage.minimalMode` configuration for a simplified status bar display.

### Changed
- Refined the status bar to adapt to the new polling and minimal-display preferences.

## [0.1.1] - 2026-02-25

### Added
- Added dashboard and manual refresh actions to the extension tooltip.

### Changed
- Updated package metadata with the new publisher, license, and repository details.
- Reworked the release script to package the extension and publish using the current version from `package.json`.
- Revised README installation and usage guidance.

## [0.1.0] - 2026-02-25

### Added
- Initial release of the extension.
- Added the renamed `cursor-usage` project structure and extension scaffolding.

### Changed
- Refactored the project layout, build pipeline, and ignore files for extension development.
- Updated scripts and execution permissions to support the renamed project.
