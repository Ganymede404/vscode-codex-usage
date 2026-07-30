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

// A separate spend-control limit some plans report alongside the primary/
// secondary rate-limit windows (e.g. a workspace budget).
export interface SpendControlLimitSnapshot {
  limit: string;
  used: string;
  remaining_percent: number;
  resets_at: number;
}

export interface RateLimits {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  credits?: CreditsSnapshot | null;
  plan_type?: string | null;
  limit_id?: string | null;
  limit_name?: string | null;
  individual_limit?: SpendControlLimitSnapshot | null;
  spend_control_reached?: boolean | null;
  // e.g. "rate_limit_reached", "workspace_owner_credits_depleted", ...
  rate_limit_reached_type?: string | null;
}

// Where a snapshot came from: the local rollout JSONL files (offline) or a
// live query against the Codex backend using the logged-in credential.
export type SnapshotSource = "rollout" | "api";

export interface Snapshot {
  rateLimits: RateLimits;
  // Human-readable origin of the snapshot. For rollout snapshots this is the
  // JSONL path; for API snapshots it is the endpoint URL.
  sourceFile: string;
  capturedAt: Date;
  // Distinguishes an offline rollout read from a live API query so the UI can
  // label the source and pick the right fallback behaviour.
  source: SnapshotSource;
}
