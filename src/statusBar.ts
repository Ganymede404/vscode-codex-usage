import * as vscode from "vscode";
import {
  Snapshot,
  RateLimitWindow,
  CreditsSnapshot,
  SpendControlLimitSnapshot,
  AdditionalRateLimitSnapshot,
} from "./types";

export interface StatusBarOptions {
  // Render a minimal chip (icon + single percent) instead of the full breakdown.
  compact?: boolean;
  // Optional status line (e.g. a fallback explanation) surfaced in the tooltip.
  note?: string;
}
import {
  formatPercent,
  formatDuration,
  getResetDisplay,
  windowLongLabel,
  windowShortLabel,
  WindowSlot,
} from "./format";

interface LabeledWindow {
  slot: WindowSlot;
  window: RateLimitWindow;
  shortLabel: string;
  longLabel: string;
}

// Codex only reports the windows that apply to the account: some plans get a
// 5h + weekly pair, others a single weekly (or monthly) window. Render what
// is present instead of assuming primary=5h and secondary=weekly.
function collectWindows(snapshot: Snapshot): LabeledWindow[] {
  const out: LabeledWindow[] = [];
  const slots: WindowSlot[] = ["primary", "secondary"];
  for (const slot of slots) {
    const window = snapshot.rateLimits[slot];
    if (!window) continue;
    out.push({
      slot,
      window,
      shortLabel: windowShortLabel(window, slot),
      longLabel: windowLongLabel(window, slot),
    });
  }
  return out;
}

function windowIcon(shortLabel: string): string {
  return shortLabel === "5h" || shortLabel === "Usage" ? "$(pulse)" : "$(calendar)";
}

const TEXT_BAR_WIDTH = 16;
const SVG_BAR_WIDTH = 180;
const SVG_BAR_HEIGHT = 10;
const SVG_BAR_RADIUS = 5;
const USAGE_COLOR_DEFAULT = "#0078d4";
const USAGE_COLOR_WARNING = "#cca700";
const USAGE_COLOR_ERROR = "#f14c4c";

export type StatusBarSide = "left" | "right";

const STATUS_BAR_PRIORITY = 100;

export class StatusBar {
  private item: vscode.StatusBarItem;
  private side: StatusBarSide;

  constructor(side: StatusBarSide = "left") {
    this.side = side;
    this.item = this.createItem(side);
  }

  private createItem(side: StatusBarSide): vscode.StatusBarItem {
    const alignment =
      side === "right" ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left;
    const item = vscode.window.createStatusBarItem(alignment, STATUS_BAR_PRIORITY);
    item.command = "codexUsage.showUsage";
    return item;
  }

  // A StatusBarItem's alignment is fixed when it's created, so switching sides
  // means disposing the old item and creating a fresh one. Returns true when the
  // item was recreated so the caller can re-render into it.
  ensureAlignment(side: StatusBarSide): boolean {
    if (side === this.side) return false;
    this.item.dispose();
    this.side = side;
    this.item = this.createItem(side);
    return true;
  }

  dispose() {
    this.item.dispose();
  }

  update(snapshot: Snapshot | null, options: StatusBarOptions = {}) {
    const compact = options.compact ?? false;
    if (!snapshot) {
      this.item.text = compact ? "$(codex-logo) —" : "$(codex-logo) Codex —";
      this.item.tooltip = "No Codex usage data. Start a Codex session or run 'codex login'.";
      this.item.backgroundColor = undefined;
      this.item.show();
      return;
    }

    const windows = collectWindows(snapshot);
    if (windows.length === 0) {
      this.item.text = compact ? "$(codex-logo) —" : "$(codex-logo) Codex —";
    } else if (compact) {
      this.item.text = formatCompactText(windows);
    } else {
      const segments = windows.map((w) => formatStatusSegment(w.shortLabel, w.window, snapshot));
      this.item.text = `$(codex-logo) Codex ${segments.join(" | ")}`;
    }
    this.item.tooltip = renderUsageTooltip(snapshot, windows, options.note);

    const highestPercent = windows.reduce((max, w) => Math.max(max, w.window.used_percent ?? 0), 0);
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
  const windows = collectWindows(snapshot);
  const items: vscode.QuickPickItem[] = windows.map((w) =>
    createUsageQuickPickItem(`${windowIcon(w.shortLabel)} ${w.longLabel}`, w.window, snapshot),
  );
  if (items.length === 0) {
    items.push({
      label: "$(pulse) Rate limits",
      detail: "No rate-limit windows reported by Codex.",
    });
  }
  items.push({
    label: "$(info) More information",
    detail: "Captured time, source file, and rate-limit window lengths.",
  });
  return items;
}

export function createMoreInformationItems(
  snapshot: Snapshot,
  note?: string,
): vscode.QuickPickItem[] {
  const items: vscode.QuickPickItem[] = [
    {
      label: snapshot.source === "api" ? "$(cloud) Source" : "$(file) Source",
      detail: `${snapshot.source === "api" ? "Live API" : "Rollout file"} — ${snapshot.sourceFile}`,
    },
    {
      label: "$(clock) Captured",
      detail: snapshot.capturedAt.toLocaleString(),
    },
  ];

  if (note) {
    items.push({ label: "$(info) Status", detail: note });
  }

  for (const w of collectWindows(snapshot)) {
    items.push({
      label: `${windowIcon(w.shortLabel)} ${w.longLabel} window`,
      detail: formatWindowLength(w.window),
    });
  }

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

  const individualLimit = formatIndividualLimit(snapshot.rateLimits.individual_limit ?? null);
  if (individualLimit) {
    items.push({
      label: "$(law) Spend limit",
      detail: individualLimit,
    });
  }

  if (snapshot.rateLimits.spend_control_reached) {
    items.push({
      label: "$(warning) Spend control reached",
      detail: formatRateLimitReachedType(snapshot.rateLimits.rate_limit_reached_type ?? null),
    });
  }

  for (const limit of snapshot.rateLimits.additional_limits ?? []) {
    const detail = formatAdditionalLimit(limit, snapshot.capturedAt);
    if (detail) {
      items.push({ label: `$(pulse) ${limit.limit_name}`, detail });
    }
  }

  return items;
}

// Renders a per-feature limit (e.g. from `additional_rate_limits`) as a single
// line combining its primary/secondary windows, matching the compact style of
// `formatStatusSegment` since these don't get their own status bar segment.
function formatAdditionalLimit(limit: AdditionalRateLimitSnapshot, capturedAt: Date): string | null {
  const parts: string[] = [];
  for (const [slot, window] of [
    ["primary", limit.primary] as const,
    ["secondary", limit.secondary] as const,
  ]) {
    if (!window) continue;
    const reset = getResetDisplay(window, capturedAt);
    const resetDuration = reset ? formatDuration(reset.secondsRemaining) : "unknown";
    parts.push(`${windowShortLabel(window, slot)} ${formatPercent(window.used_percent)} · ${resetDuration}`);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatCredits(credits: CreditsSnapshot | null): string | null {
  if (!credits) return null;
  if (credits.unlimited) return "Unlimited";
  if (!credits.has_credits) return "No credits";
  return credits.balance ? `Balance: ${credits.balance}` : "Available";
}

function formatIndividualLimit(limit: SpendControlLimitSnapshot | null): string | null {
  if (!limit) return null;
  return `${limit.used} / ${limit.limit} (${limit.remaining_percent}% remaining)`;
}

function formatRateLimitReachedType(type: string | null): string {
  if (!type) return "Limit reached";
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function isMoreInformationItem(item: vscode.QuickPickItem | undefined): boolean {
  return item?.label === "$(info) More information";
}

function renderUsageTooltip(
  snapshot: Snapshot,
  windows: LabeledWindow[],
  note?: string,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: ["codexUsage.showMoreInformation"] };

  md.appendMarkdown(`**Codex usage** · ${sourceLabel(snapshot)}\n\n`);
  if (windows.length === 0) {
    md.appendMarkdown("No rate-limit windows reported\n");
  } else {
    windows.forEach((w, i) => {
      if (i > 0) md.appendMarkdown("\n\n");
      appendUsageWindow(md, w.longLabel, w.window, snapshot);
    });
  }
  if (note) {
    md.appendMarkdown(`\n\n$(info) ${escapeMarkdownAltText(note)}`);
  }
  md.appendMarkdown("\n\n[More information](command:codexUsage.showMoreInformation)");

  return md;
}

// Icon + label describing where the snapshot came from.
function sourceLabel(snapshot: Snapshot): string {
  return snapshot.source === "api" ? "$(cloud) Live API" : "$(file) Rollout file";
}

// Compact chip: icon + the single highest-used window percent, so the number
// always matches the warning/error background colour.
function formatCompactText(windows: LabeledWindow[]): string {
  const top = windows.reduce((a, b) =>
    (b.window.used_percent ?? 0) > (a.window.used_percent ?? 0) ? b : a,
  );
  return `$(codex-logo) ${formatPercent(clampPercent(top.window.used_percent))}`;
}

function appendUsageWindow(
  md: vscode.MarkdownString,
  label: string,
  window: RateLimitWindow,
  snapshot: Snapshot,
) {
  md.appendMarkdown(`**${label}**\n\n`);
  const pct = clampPercent(window.used_percent);
  md.appendMarkdown(`${formatSvgBar(pct, `${label} usage ${formatPercent(pct)}`)} ${formatPercent(pct)}\n\n`);
  md.appendMarkdown(`Resets ${formatResetDate(window, snapshot)}`);
}

function createUsageQuickPickItem(
  label: string,
  window: RateLimitWindow,
  snapshot: Snapshot,
): vscode.QuickPickItem {
  const pct = clampPercent(window.used_percent);
  return {
    label: `${label} ${formatPercent(pct)}`,
    description: formatTextBar(pct),
    detail: `Resets ${formatResetDate(window, snapshot)}`,
  };
}

function formatStatusSegment(label: string, window: RateLimitWindow, snapshot: Snapshot): string {
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
