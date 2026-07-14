export interface RateLimitWindow {
  used_percent: number;
  // Optional in current Codex releases; older releases always set it.
  window_minutes?: number | null;
  // Legacy field from older Codex releases (relative to capture time).
  resets_in_seconds?: number;
  // Current Codex releases: absolute Unix timestamp in seconds.
  resets_at?: number | null;
}

export interface CreditsSnapshot {
  has_credits: boolean;
  unlimited: boolean;
  balance?: string | null;
}

export interface RateLimits {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  credits?: CreditsSnapshot | null;
  plan_type?: string | null;
  limit_id?: string | null;
  limit_name?: string | null;
}

export interface Snapshot {
  rateLimits: RateLimits;
  sourceFile: string;
  capturedAt: Date;
}
