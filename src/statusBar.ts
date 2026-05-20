import * as vscode from "vscode";
import { Snapshot, RateLimitWindow } from "./types";
import { formatPercent, formatDuration, formatResetTime } from "./format";

export class StatusBar {
  private session: vscode.StatusBarItem;
  private weekly: vscode.StatusBarItem;

  constructor() {
    this.session = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.session.command = "codexUsage.showDetails";
    this.weekly = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.weekly.command = "codexUsage.showDetails";
  }

  dispose() {
    this.session.dispose();
    this.weekly.dispose();
  }

  update(snapshot: Snapshot | null, opts: { showSession: boolean; showWeekly: boolean }) {
    if (!snapshot) {
      this.session.text = "$(pulse) Codex —";
      this.session.tooltip = "No Codex rollout files found. Start a Codex session to populate usage.";
      this.weekly.text = "$(calendar) Week —";
      this.weekly.tooltip = this.session.tooltip;
      if (opts.showSession) this.session.show(); else this.session.hide();
      if (opts.showWeekly) this.weekly.show(); else this.weekly.hide();
      return;
    }

    const { primary, secondary } = snapshot.rateLimits;
    this.renderItem(this.session, "$(pulse) Codex", primary ?? null, snapshot);
    this.renderItem(this.weekly, "$(calendar) Week", secondary ?? null, snapshot);

    if (opts.showSession) this.session.show(); else this.session.hide();
    if (opts.showWeekly) this.weekly.show(); else this.weekly.hide();
  }

  private renderItem(
    item: vscode.StatusBarItem,
    label: string,
    window: RateLimitWindow | null,
    snapshot: Snapshot,
  ) {
    if (!window) {
      item.text = `${label} —`;
      item.tooltip = `No data yet (rate_limits was null in the latest event).\nSource: ${snapshot.sourceFile}`;
      item.backgroundColor = undefined;
      return;
    }
    const pct = window.used_percent;
    item.text = `${label} ${formatPercent(pct)} · ${formatDuration(window.resets_in_seconds)}`;

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${label.replace(/\$\([^)]+\)\s*/, "")}** usage\n\n`);
    md.appendMarkdown(`- Used: **${formatPercent(pct)}**\n`);
    md.appendMarkdown(`- Window: ${window.window_minutes} min\n`);
    md.appendMarkdown(`- Resets in: ${formatDuration(window.resets_in_seconds)} (at ${formatResetTime(window.resets_in_seconds, snapshot.capturedAt)})\n`);
    md.appendMarkdown(`- Captured: ${snapshot.capturedAt.toLocaleString()}\n`);
    md.appendMarkdown(`- Source: \`${snapshot.sourceFile}\`\n`);
    item.tooltip = md;

    if (pct >= 90) {
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else if (pct >= 75) {
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      item.backgroundColor = undefined;
    }
  }
}
