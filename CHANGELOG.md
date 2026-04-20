# Changelog

All notable changes to this project are documented in this file.

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
