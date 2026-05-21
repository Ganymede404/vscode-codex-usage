import { RateLimitWindow } from "./types";

export function formatPercent(p: number): string {
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return "unknown";
  if (totalSeconds <= 0) return "0m";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatResetTime(secondsFromNow: number, now: Date = new Date()): string {
  if (!Number.isFinite(secondsFromNow) || !Number.isFinite(now.getTime())) return "unknown";
  const reset = new Date(now.getTime() + secondsFromNow * 1000);
  if (!Number.isFinite(reset.getTime())) return "unknown";
  return reset.toLocaleString();
}

export interface ResetDisplay {
  secondsRemaining: number;
  resetAt: Date;
}

export function getResetDisplay(
  window: RateLimitWindow,
  capturedAt: Date,
  now: Date = new Date(),
): ResetDisplay | null {
  let resetAt: Date | null = null;

  if (typeof window.resets_at === "number" && Number.isFinite(window.resets_at)) {
    resetAt = new Date(window.resets_at * 1000);
  } else if (
    typeof window.resets_in_seconds === "number" &&
    Number.isFinite(window.resets_in_seconds) &&
    Number.isFinite(capturedAt.getTime())
  ) {
    resetAt = new Date(capturedAt.getTime() + window.resets_in_seconds * 1000);
  }

  if (!resetAt || !Number.isFinite(resetAt.getTime()) || !Number.isFinite(now.getTime())) {
    return null;
  }

  return {
    secondsRemaining: Math.max(0, Math.floor((resetAt.getTime() - now.getTime()) / 1000)),
    resetAt,
  };
}
