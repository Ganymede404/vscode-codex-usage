import * as vscode from "vscode";
import { Snapshot, RateLimitWindow, CreditsSnapshot } from "./types";
import { formatPercent, formatDuration, getResetDisplay } from "./format";

const TEXT_BAR_WIDTH = 16;
const SVG_BAR_WIDTH = 180;
const SVG_BAR_HEIGHT = 10;
const SVG_BAR_RADIUS = 5;
const USAGE_COLOR_DEFAULT = "#0078d4";
const USAGE_COLOR_WARNING = "#cca700";
const USAGE_COLOR_ERROR = "#f14c4c";

export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = "codexUsage.showUsage";
  }

  dispose() {
    this.item.dispose();
  }

  update(snapshot: Snapshot | null) {
    if (!snapshot) {
      this.item.text = "$(pulse) Codex —";
      this.item.tooltip = "No Codex rollout files found. Start a Codex session to populate usage.";
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    const { primary, secondary } = snapshot.rateLimits;
    this.item.text = `$(pulse) ${formatStatusSegment("Codex", primary ?? null, snapshot)} | ${formatStatusSegment("Week", secondary ?? null, snapshot)}`;
    this.item.tooltip = renderUsageTooltip(snapshot);

    const highestPercent = Math.max(primary?.used_percent ?? 0, secondary?.used_percent ?? 0);
    if (highestPercent >= 90) {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else if (highestPercent >= 75) {
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.item.backgroundColor = undefined;
    }

    this.item.show();
  }
}

export function createUsageSummaryItems(snapshot: Snapshot): vscode.QuickPickItem[] {
  return [
    createUsageQuickPickItem("$(pulse) Current session", snapshot.rateLimits.primary ?? null, snapshot),
    createUsageQuickPickItem("$(calendar) Weekly", snapshot.rateLimits.secondary ?? null, snapshot),
    {
      label: "$(info) More information",
      detail: "Captured time, source file, and rate-limit window lengths.",
    },
  ];
}

export function createMoreInformationItems(snapshot: Snapshot): vscode.QuickPickItem[] {
  const items: vscode.QuickPickItem[] = [
    {
      label: "$(clock) Captured",
      detail: snapshot.capturedAt.toLocaleString(),
    },
    {
      label: "$(file) Source",
      detail: snapshot.sourceFile,
    },
    {
      label: "$(pulse) Current session window",
      detail: formatWindowLength(snapshot.rateLimits.primary ?? null),
    },
    {
      label: "$(calendar) Weekly window",
      detail: formatWindowLength(snapshot.rateLimits.secondary ?? null),
    },
  ];

  if (snapshot.rateLimits.plan_type) {
    items.push({
      label: "$(account) Plan",
      detail: snapshot.rateLimits.plan_type,
    });
  }

  const credits = formatCredits(snapshot.rateLimits.credits ?? null);
  if (credits) {
    items.push({
      label: "$(credit-card) Credits",
      detail: credits,
    });
  }

  return items;
}

function formatCredits(credits: CreditsSnapshot | null): string | null {
  if (!credits) return null;
  if (credits.unlimited) return "Unlimited";
  if (!credits.has_credits) return "No credits";
  return credits.balance ? `Balance: ${credits.balance}` : "Available";
}

export function isMoreInformationItem(item: vscode.QuickPickItem | undefined): boolean {
  return item?.label === "$(info) More information";
}

function renderUsageTooltip(snapshot: Snapshot): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: ["codexUsage.showMoreInformation"] };

  md.appendMarkdown("**Codex usage**\n\n");
  appendUsageWindow(md, "Current session", snapshot.rateLimits.primary ?? null, snapshot);
  md.appendMarkdown("\n\n");
  appendUsageWindow(md, "Weekly", snapshot.rateLimits.secondary ?? null, snapshot);
  md.appendMarkdown("\n\n[More information](command:codexUsage.showMoreInformation)");

  return md;
}

function appendUsageWindow(
  md: vscode.MarkdownString,
  label: string,
  window: RateLimitWindow | null,
  snapshot: Snapshot,
) {
  md.appendMarkdown(`**${label}**\n\n`);
  if (!window) {
    md.appendMarkdown("No data\n");
    return;
  }

  const pct = clampPercent(window.used_percent);
  md.appendMarkdown(`${formatSvgBar(pct, `${label} usage ${formatPercent(pct)}`)} ${formatPercent(pct)}\n\n`);
  md.appendMarkdown(`Resets ${formatResetDate(window, snapshot)}`);
}

function createUsageQuickPickItem(
  label: string,
  window: RateLimitWindow | null,
  snapshot: Snapshot,
): vscode.QuickPickItem {
  if (!window) {
    return {
      label,
      description: formatTextBar(0),
      detail: "No data",
    };
  }

  const pct = clampPercent(window.used_percent);
  return {
    label: `${label} ${formatPercent(pct)}`,
    description: formatTextBar(pct),
    detail: `Resets ${formatResetDate(window, snapshot)}`,
  };
}

function formatStatusSegment(label: string, window: RateLimitWindow | null, snapshot: Snapshot): string {
  if (!window) return `${label} —`;

  const reset = getResetDisplay(window, snapshot.capturedAt);
  const resetDuration = reset ? formatDuration(reset.secondsRemaining) : "unknown";
  return `${label} ${formatPercent(window.used_percent)} · ${resetDuration}`;
}

function formatWindowLength(window: RateLimitWindow | null): string {
  if (!window) return "No data";
  if (typeof window.window_minutes !== "number" || !Number.isFinite(window.window_minutes)) {
    return "Unknown";
  }
  return `${window.window_minutes} min`;
}

function formatResetDate(window: RateLimitWindow, snapshot: Snapshot): string {
  const reset = getResetDisplay(window, snapshot.capturedAt);
  return reset ? reset.resetAt.toLocaleString() : "unknown";
}

function formatTextBar(percent: number): string {
  const pct = clampPercent(percent);
  const filled = pct > 0 ? Math.max(1, Math.round((pct / 100) * TEXT_BAR_WIDTH)) : 0;
  return `${getUsageIcon(pct)} ${"█".repeat(filled)}${"░".repeat(TEXT_BAR_WIDTH - filled)}`;
}

function formatSvgBar(percent: number, altText: string): string {
  const pct = clampPercent(percent);
  const fillWidth = Math.round((pct / 100) * SVG_BAR_WIDTH);
  const fillColor = getUsageColor(pct);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_BAR_WIDTH}" height="${SVG_BAR_HEIGHT}" viewBox="0 0 ${SVG_BAR_WIDTH} ${SVG_BAR_HEIGHT}">`,
    `<rect width="${SVG_BAR_WIDTH}" height="${SVG_BAR_HEIGHT}" rx="${SVG_BAR_RADIUS}" fill="#2d2d30"/>`,
    `<rect width="${fillWidth}" height="${SVG_BAR_HEIGHT}" rx="${SVG_BAR_RADIUS}" fill="${fillColor}"/>`,
    `<rect x="0.5" y="0.5" width="${SVG_BAR_WIDTH - 1}" height="${SVG_BAR_HEIGHT - 1}" rx="${SVG_BAR_RADIUS - 0.5}" fill="none" stroke="#6e7681" stroke-opacity="0.8"/>`,
    "</svg>",
  ].join("");
  const encoded = Buffer.from(svg).toString("base64");
  return `![${escapeMarkdownAltText(altText)}](data:image/svg+xml;base64,${encoded})`;
}

function escapeMarkdownAltText(text: string): string {
  return text.replace(/[[\]\\]/g, "\\$&");
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return USAGE_COLOR_ERROR;
  if (percent >= 75) return USAGE_COLOR_WARNING;
  return USAGE_COLOR_DEFAULT;
}

function getUsageIcon(percent: number): string {
  if (percent >= 90) return "$(error)";
  if (percent >= 75) return "$(warning)";
  return "$(circle-filled)";
}

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}
