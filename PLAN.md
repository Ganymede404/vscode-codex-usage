# vscode-codex-usage — Plan

A small VS Code extension that monitors OpenAI Codex CLI usage and surfaces
**current session (5h)** and **weekly** usage right inside the editor.

## Goals

- Show **current session usage** (Codex "primary" rate limit, ~5h window).
- Show **weekly usage** (Codex "secondary" rate limit, ~7d window).
- Stay out of the way: status bar first, details panel on click.
- Read-only: no network, no auth, no telemetry. Just parse local files.

Out of scope (for v1): per-model breakdown, cost tracking, historical
charts, multi-account, notifications/alerts.

## Data source

Codex CLI writes rollout files at:

```
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

Each rollout is JSONL. The events we care about look like:

```json
{
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "rate_limits": {
      "primary":   { "used_percent": 12.3, "window_minutes": 299,   "resets_in_seconds": 17940 },
      "secondary": { "used_percent": 22.0, "window_minutes": 10079, "resets_in_seconds": 351406 }
    }
  }
}
```

Strategy: walk `~/.codex/sessions/` back up to 7 days, find the most
recently modified `rollout-*.jsonl`, scan it from the end for the last
`token_count` event with a non-null `rate_limits`. That's the freshest
snapshot Codex has produced locally.

Edge cases to handle:
- `rate_limits` is sometimes `null` (e.g. exec mode) — skip and keep
  looking backwards.
- No rollout files yet → show "no data" state.
- `~/.codex` lives somewhere else → make the path configurable.

## UX

**Status bar (left)**, two items:

```
$(pulse) Codex 12% · 4h59m     ⟶  session (primary)
$(calendar) Week 22% · 4d 2h   ⟶  weekly  (secondary)
```

Color: default until `used_percent >= 75` (warning), `>= 90` (error)
via `backgroundColor`.

Tooltip per item: exact percent, window length, exact reset time
(localized), path of the rollout file the data came from.

Click → opens a small **details webview** with both meters, raw numbers,
last-updated timestamp, and a Refresh button.

## Commands

- `codexUsage.refresh` — re-scan and update.
- `codexUsage.showDetails` — open the details panel.
- `codexUsage.openSessionsFolder` — reveal `~/.codex/sessions` in the OS.

## Settings (`contributes.configuration`)

- `codexUsage.codexHome` (string, default `""` → resolves to `~/.codex`).
- `codexUsage.refreshIntervalSeconds` (number, default `60`).
- `codexUsage.lookbackDays` (number, default `7`).
- `codexUsage.showWeekly` (boolean, default `true`).
- `codexUsage.showSession` (boolean, default `true`).

## Architecture

```
src/
  extension.ts        activate/deactivate, wires everything
  codexReader.ts      find latest rollout, parse last token_count
  statusBar.ts        two StatusBarItems + formatting
  detailsPanel.ts     webview for details view
  format.ts           percent / duration helpers
  types.ts            RateLimits, Snapshot
```

`codexReader` exposes `readLatestSnapshot(opts): Promise<Snapshot | null>`.
It does NOT use `fs.watch` on JSONL (they grow fast and noisily); instead
the extension polls on `refreshIntervalSeconds`. Cheap because we only
read the tail of one file.

## Repo layout

```
package.json          extension manifest + contributes
tsconfig.json
.vscodeignore
src/...
README.md             usage, screenshots, limitations
PLAN.md               this file
```

Build: `tsc` to `out/`. No bundler needed for v1.

## Milestones

1. **Scaffold** — `package.json`, `tsconfig.json`, empty `extension.ts`,
   activates on startup.
2. **Reader** — `codexReader.ts` + a small unit-style smoke test driven
   by a fixture JSONL.
3. **Status bar** — wire reader → two status bar items with polling.
4. **Details webview** — click-through panel.
5. **Settings + commands** — configurable home dir, refresh, reveal.
6. **README** — install/run/limitations, note re: `null` rate_limits.

Commit the plan first, then land milestones 1–3 in this session.
