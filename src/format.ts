export function formatPercent(p: number): string {
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatResetTime(secondsFromNow: number, now: Date = new Date()): string {
  const reset = new Date(now.getTime() + secondsFromNow * 1000);
  return reset.toLocaleString();
}
