# vscode-codex-usage

A tiny VS Code extension that shows your **OpenAI Codex CLI** usage in the
status bar — current session (5h window) and weekly window — by reading
the latest rollout file under `~/.codex/sessions/`.

## What you get

A single status bar item on the left:

```
$(pulse) Codex 12% · 4h59m | Week 22% · 4d 2h
```

Hover or click the item to see current-session and weekly usage bars with reset
dates. Use **More information** for the captured time, source file, and window
lengths.

## How it works

Codex CLI writes JSONL rollout files at
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Each `token_count` event
includes a `rate_limits` object with `primary` (5h) and `secondary` (weekly)
windows. The extension walks back up to N days, finds the most recently
modified rollout, and reads the last `token_count` event with non-null
`rate_limits`.

No network, no auth, no telemetry.

## Settings

- `codexUsage.codexHome` — override `~/.codex` if you keep it elsewhere.
- `codexUsage.refreshIntervalSeconds` — poll interval (default 60).
- `codexUsage.lookbackDays` — how far back to scan (default 7).

## Commands

- **Codex Usage: Refresh**
- **Codex Usage: Show Usage**
- **Codex Usage: Show More Information**
- **Codex Usage: Open Sessions Folder**

## Build

```sh
npm install
npm run compile
```

Then press F5 in VS Code to launch an Extension Development Host.

## Limitations

- In Codex `exec` mode the CLI emits `rate_limits: null`. The extension
  skips those events; if every recent event is null you'll see "—" until
  an interactive session produces a populated event.
- This is a snapshot from the most recent rollout — it doesn't refresh
  numbers faster than Codex itself writes them.
