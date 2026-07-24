# Codex Usage for VS Code

A lightweight VS Code extension that shows your OpenAI Codex CLI rate limits
in the status bar. It reads local Codex session data and requires no network
access, authentication, or telemetry.

## Features

- Shows each available rate-limit window, usage percentage, and time to reset.
- Provides usage bars and exact reset times on hover or click.
- Adapts to the windows reported by your plan, including 5-hour, daily,
  weekly, and monthly limits.
- Displays plan, credits, and spend-control information when available.
- Supports current and legacy Codex rollout schemas.

The status bar displays a compact summary such as:

```text
Codex 5h 12% · 4h59m | Week 22% · 4d 2h
```

## Installation

1. Download the latest `.vsix` file from
   [GitHub Releases](https://github.com/Ganymede404/vscode-codex-usage/releases).
2. In VS Code, run **Extensions: Install from VSIX...** from the Command
   Palette and select the downloaded file.

VS Code 1.85 or later and an existing Codex CLI session are required.

## How It Works

Codex CLI writes JSONL rollout files to:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
```

The extension scans recent rollouts and uses the latest `token_count` event
with rate-limit data. Windows are labeled by their reported duration rather
than by their `primary` or `secondary` slot. Both `resets_at` and the legacy
`resets_in_seconds` field are supported.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codexUsage.codexHome` | `~/.codex` | Codex home directory. |
| `codexUsage.refreshIntervalSeconds` | `60` | How often to refresh usage, in seconds. |
| `codexUsage.lookbackDays` | `7` | Number of days to scan for rollout files. |

## Commands

| Command | Description |
| --- | --- |
| **Codex Usage: Refresh** | Refresh the current usage snapshot. |
| **Codex Usage: Show Usage** | Open the usage summary. |
| **Codex Usage: Show More Information** | Show snapshot and account details. |
| **Codex Usage: Open Sessions Folder** | Reveal the Codex sessions directory. |

## Development

```sh
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Limitations

- Codex `exec` mode may emit `rate_limits: null`. These events are skipped;
  usage remains unavailable until Codex writes a populated event.
- Usage reflects the latest local rollout snapshot and cannot update more
  frequently than Codex writes that data.
