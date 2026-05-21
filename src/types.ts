export interface RateLimitWindow {
  used_percent: number;
  window_minutes: number;
  resets_in_seconds?: number;
  resets_at?: number;
}

export interface RateLimits {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
}

export interface Snapshot {
  rateLimits: RateLimits;
  sourceFile: string;
  capturedAt: Date;
}
