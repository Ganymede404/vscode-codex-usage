import * as vscode from "vscode";
import { readLatestSnapshot } from "./codexReader";
import { StatusBar } from "./statusBar";
import { RateLimitWindow, Snapshot } from "./types";
import { formatDuration, formatPercent, getResetDisplay } from "./format";

let timer: NodeJS.Timeout | undefined;
let statusBar: StatusBar | undefined;
let lastSnapshot: Snapshot | null = null;

function getConfig() {
  const c = vscode.workspace.getConfiguration("codexUsage");
  return {
    codexHome: c.get<string>("codexHome", ""),
    refreshIntervalSeconds: c.get<number>("refreshIntervalSeconds", 60),
    lookbackDays: c.get<number>("lookbackDays", 7),
    showSession: c.get<boolean>("showSession", true),
    showWeekly: c.get<boolean>("showWeekly", true),
  };
}

async function refresh() {
  if (!statusBar) return;
  const cfg = getConfig();
  try {
    lastSnapshot = await readLatestSnapshot({
      codexHome: cfg.codexHome,
      lookbackDays: cfg.lookbackDays,
    });
  } catch (err) {
    lastSnapshot = null;
    console.error("[codex-usage] read failed:", err);
  }
  statusBar.update(lastSnapshot, { showSession: cfg.showSession, showWeekly: cfg.showWeekly });
}

function restartTimer() {
  if (timer) clearInterval(timer);
  const cfg = getConfig();
  const intervalMs = Math.max(5, cfg.refreshIntervalSeconds) * 1000;
  timer = setInterval(refresh, intervalMs);
}

function showDetails() {
  const panel = vscode.window.createWebviewPanel(
    "codexUsageDetails",
    "Codex Usage",
    vscode.ViewColumn.Active,
    { enableScripts: false },
  );
  panel.webview.html = renderDetailsHtml(lastSnapshot);
}

function renderDetailsHtml(snapshot: Snapshot | null): string {
  if (!snapshot) {
    return `<!doctype html><html><body style="font-family: var(--vscode-font-family); padding: 1rem;">
<h2>Codex Usage</h2>
<p>No data yet. Start a Codex CLI session so it writes a rollout file under <code>~/.codex/sessions/</code>, then run <em>Codex Usage: Refresh</em>.</p>
</body></html>`;
  }

  const row = (label: string, w: RateLimitWindow | null | undefined) => {
    if (!w) {
      return `<tr><th>${label}</th><td colspan="3"><em>no data (rate_limits was null)</em></td></tr>`;
    }
    const pct = w.used_percent;
    const reset = getResetDisplay(w, snapshot.capturedAt);
    const resetDuration = reset ? formatDuration(reset.secondsRemaining) : "unknown";
    const resetAt = reset ? reset.resetAt.toLocaleString() : "unknown";
    const barColor = pct >= 90 ? "var(--vscode-errorForeground)" : pct >= 75 ? "var(--vscode-editorWarning-foreground)" : "var(--vscode-progressBar-background)";
    return `
      <tr>
        <th>${label}</th>
        <td style="width:60%">
          <div class="usage-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, Math.max(0, pct))}">
            <div class="usage-bar__fill" style="background: ${barColor}; width: ${Math.min(100, Math.max(0, pct))}%;"></div>
          </div>
        </td>
        <td>${formatPercent(pct)}</td>
        <td>resets in ${resetDuration}<br/><small>at ${resetAt}</small></td>
      </tr>`;
  };

  return `<!doctype html><html><head>
<style>
  body {
    font-family: var(--vscode-font-family);
    padding: 1rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
  }

  td,
  th {
    padding: 0.35rem 0.5rem 0.35rem 0;
    vertical-align: middle;
  }

  .usage-bar {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, var(--vscode-descriptionForeground)));
    border-radius: 4px;
    box-sizing: border-box;
    height: 16px;
    overflow: hidden;
  }

  .usage-bar__fill {
    height: 100%;
    min-width: 1px;
  }
</style>
</head><body>
<h2>Codex Usage</h2>
<table>
  <tbody>
    ${row("Current session (5h)", snapshot.rateLimits.primary)}
    ${row("Weekly", snapshot.rateLimits.secondary)}
  </tbody>
</table>
<p><small>Captured ${snapshot.capturedAt.toLocaleString()}<br/>Source: <code>${snapshot.sourceFile}</code></small></p>
</body></html>`;
}

export function activate(context: vscode.ExtensionContext) {
  statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("codexUsage.refresh", refresh),
    vscode.commands.registerCommand("codexUsage.showDetails", showDetails),
    vscode.commands.registerCommand("codexUsage.openSessionsFolder", async () => {
      const cfg = getConfig();
      const { resolveCodexHome } = await import("./codexReader");
      const home = resolveCodexHome(cfg.codexHome);
      const uri = vscode.Uri.file(`${home}/sessions`);
      await vscode.commands.executeCommand("revealFileInOS", uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("codexUsage")) return;
      restartTimer();
      void refresh();
    }),
  );

  restartTimer();
  void refresh();
}

export function deactivate() {
  if (timer) clearInterval(timer);
  statusBar?.dispose();
}
