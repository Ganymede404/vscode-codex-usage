---
name: vscode-codex-usage
description: Maintain the vscode-codex-usage VS Code extension. Use when changing the Codex usage status bar, rollout JSONL parsing, extension manifest, Marketplace packaging, README, or development workflow in this repository.
---

# vscode-codex-usage

## Purpose

This repo is a TypeScript VS Code extension that shows Codex CLI primary/session
and secondary/weekly usage in one VS Code status bar item. Data comes either
from local rollout JSONL files in `~/.codex/sessions/` (offline) or from a live
query against the Codex usage endpoint using the logged-in credential (online),
selected via `codexUsage.source`.

## Current Shape

- `src/extension.ts`: activation, polling, command registration, quick-pick UI,
  and source selection (`auto`/`api`/`rollout`) with rollout fallback.
- `src/statusBar.ts`: single `StatusBarItem`, tooltip rendering, native usage and
  metadata item builders, compact/full text, source labeling, and left/right
  alignment (recreates the item since alignment is fixed at creation).
- `src/codexReader.ts`: resolves Codex home, finds recent rollout files, parses
  the latest usable `token_count.rate_limits`.
- `src/codexAuth.ts`: reads `~/.codex/auth.json` for the OAuth access token and
  ChatGPT account id (with JWT-claim fallback). Read-only; never refreshes.
- `src/codexApi.ts`: GETs `chatgpt.com/backend-api/wham/usage` and normalizes the
  (undocumented) response into `RateLimits`. Throws `CodexApiError`.
- `src/format.ts`: percent, duration, and reset-time helpers.
- `src/types.ts`: `RateLimitWindow`, `RateLimits`, `Snapshot`, `SnapshotSource`.
- `icons/codex-icon.woff`: contributed Codex-logo icon font (glyph U+E900) used as
  the status bar `$(codex-logo)` icon.
- `package.json`: VS Code extension manifest, `contributes.icons`, npm scripts.

## UI Constraints

- Keep one status bar item. Do not split session and weekly usage back into two
  items unless explicitly requested.
- Default (non-compact) status text stays:
  `$(pulse) Codex <session percent> · <session reset> | Week <weekly percent> · <weekly reset>`.
  When `codexUsage.compactStatusBar` is on, show only `$(pulse) <highest percent>`.
- Hover should stay lightweight and native: show only session and weekly usage
  bars plus reset dates, then a `More information` command link.
- Click should use native VS Code UI such as `showQuickPick`, not a webview,
  unless the user explicitly asks for custom HTML.
- Extra metadata belongs behind `More information`: captured time, source file,
  and rate-limit window lengths.
- The leading status bar icon is the contributed Codex logo `$(codex-logo)`, backed
  by `icons/codex-icon.woff` (glyph U+E900) declared under `contributes.icons` in
  `package.json`. As a font glyph it is monochrome and inherits the status bar
  foreground colour, so it adapts to light and dark themes automatically — do
  not add separate light/dark image assets for the status bar.
- The font is self-generated from the Codex logo. If you replace or regenerate
  it, keep the glyph mapped to U+E900 (or update `fontCharacter` to match).
- Other in-menu icons use built-in Codicons in `$(name)` syntax (e.g. `$(pulse)`
  / `$(calendar)` to distinguish 5h vs weekly windows in the quick pick).

## Build And Test

Use the repo scripts:

```sh
npm install
npm run compile
```

For manual extension testing, open the repo in VS Code and press F5. The
`.vscode/launch.json` config starts an Extension Development Host and runs
`npm: compile` first.

Package locally with:

```sh
npx @vscode/vsce package
code --install-extension vscode-codex-usage-<version>.vsix
```

## Marketplace Notes

- Publish with `vsce`; `package.json` must have a unique lowercase `name`, a
  SemVer `version`, a `publisher`, `engines.vscode`, `main`, `categories`, and
  useful Marketplace metadata.
- Do not use SVG for the Marketplace icon. README/CHANGELOG images should be
  HTTPS and should avoid untrusted SVGs.
- A GitHub pipeline is optional. Local publishing with `vsce publish` is normal
  for small extensions. CI is useful once releases should be repeatable.
- If adding CI publishing, store the Marketplace/Azure DevOps token as
  `VSCE_PAT` in repository secrets and run `vsce publish` only from an explicit
  release/tag workflow.

## Change Guidance

- Prefer small, focused changes and run `npm run compile` before finishing.
- Keep `README.md` and `PLAN.md` aligned when user-facing behavior changes.
- Avoid adding runtime network calls; the extension should remain local,
  read-only, and telemetry-free.
- Treat `out/`, `node_modules/`, `.vscode-test/`, and `*.vsix` as generated.
