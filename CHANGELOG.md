# Changelog

## 0.2.0

- Add an **online mode** that queries the live Codex usage endpoint
  (`chatgpt.com/backend-api/wham/usage`) with the credential already stored in
  `~/.codex/auth.json`, instead of reading local rollout files. The access
  token and ChatGPT account id are read from the logged-in session; nothing is
  refreshed or written back.
- Add the `codexUsage.source` setting to choose the data source:
  - `auto` (default) — query the API when logged in, otherwise use rollout
    files.
  - `api` — always query the API.
  - `rollout` — always read local rollout files (offline, previous behaviour).
  Online modes fall back to the latest rollout snapshot whenever the live query
  can't run (not logged in, expired token, offline), and the reason is shown in
  the tooltip and `More information` view.
- Add the `codexUsage.compactStatusBar` setting for a compact status bar chip
  (icon + single highest-used percent) as an alternative to the full
  per-window breakdown.
- Use the Codex logo as the status bar icon (contributed icon font,
  `icons/codex-icon.woff`) in both compact and non-compact views. As a
  monochrome glyph it inherits the status bar colour, so it adapts to light and
  dark themes automatically.
- Show the active source (Live API vs rollout file) in the tooltip and
  `More information` view.

## 0.1.2

- Read the newest `rate_limits` fields Codex reports: a per-account
  `individual_limit` spend-control snapshot, `spend_control_reached`, and
  `rate_limit_reached_type`. Surface them in the `More information` view when
  present.

## 0.1.1

- Support the current Codex CLI rate-limit schema: `resets_at` Unix timestamps
  (replacing `resets_in_seconds`) and optional `window_minutes`. Legacy
  rollouts keep working.
- Label rate-limit windows by their actual length (`5h`, `Day`, `Week`,
  `Month`) instead of assuming primary = current session (5h) and
  secondary = weekly, matching Codex's own `/status` behavior. Accounts that
  only report a weekly window no longer see it mislabeled as the session
  limit next to an empty "Week —" slot.
- Hide windows Codex does not report instead of showing empty placeholders.
- Read the new snapshot fields Codex now reports: `plan_type`, `credits`, and
  `limit_name`/`limit_id`.
- Show plan and credits in the `More information` view when present.
- Keep snapshots that report only credits (no rate-limit windows) instead of
  skipping them.
- Show "Unknown" instead of a broken window length when Codex omits
  `window_minutes`.

## 0.1.0

- Prepare the first public release version.
- Add GitHub Actions release workflow that packages the extension, creates a version tag, and publishes a GitHub Release with the VSIX artifact.
- Keep release notes sourced from the matching changelog section.
- Change usage bar colors to warning yellow at 75% and error red at 90%.

## 0.0.2

- Add Marketplace icon metadata and optimized PNG icon.
- Add MIT license text.

## 0.0.1

- Initial Codex usage status bar extension.
- Read local Codex CLI rollout files from `~/.codex/sessions/`.
- Show current-session and weekly usage in a single VS Code status bar item.
- Show native hover and click summaries with usage bars and reset dates.
- Provide extra captured/source/window metadata behind `More information`.
