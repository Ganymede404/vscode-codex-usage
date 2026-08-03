import * as https from "https";
import { readCodexAuth } from "./codexAuth";
import {
  CreditsSnapshot,
  RateLimits,
  RateLimitWindow,
  Snapshot,
  SpendControlLimitSnapshot,
} from "./types";

// Undocumented ChatGPT/Codex backend endpoint the Codex CLI itself uses to
// report `/status`. Read-only GET. May change without notice; we normalise the
// response defensively and fall back to rollout files when it does not fit.
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REQUEST_TIMEOUT_MS = 10_000;

export interface ApiReaderOptions {
  codexHome?: string;
  timeoutMs?: number;
}

export type ApiFailureReason = "not_logged_in" | "unauthorized" | "network" | "no_data";

export class CodexApiError extends Error {
  constructor(
    public readonly reason: ApiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "CodexApiError";
  }
}

interface HttpResponse {
  status: number;
  body: string;
}

function httpGetJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.end();
  });
}

/**
 * Query the live Codex usage endpoint with the logged-in credential.
 * Throws {@link CodexApiError} so callers can decide how to fall back.
 */
export async function readApiSnapshot(opts: ApiReaderOptions = {}): Promise<Snapshot> {
  const auth = readCodexAuth(opts.codexHome);
  if (!auth) {
    throw new CodexApiError("not_logged_in", "No Codex login found (auth.json missing or has no tokens).");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: "application/json",
    "User-Agent": "vscode-codex-usage",
  };
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;

  let res: HttpResponse;
  try {
    res = await httpGetJson(USAGE_URL, headers, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  } catch (err) {
    throw new CodexApiError("network", `Codex usage request failed: ${(err as Error).message}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new CodexApiError(
      "unauthorized",
      `Codex usage request was rejected (HTTP ${res.status}). The login token may have expired; run 'codex login'.`,
    );
  }
  if (res.status < 200 || res.status >= 300) {
    throw new CodexApiError("network", `Codex usage request returned HTTP ${res.status}.`);
  }

  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    throw new CodexApiError("no_data", "Codex usage response was not valid JSON.");
  }

  const rateLimits = normalizeRateLimits(json);
  if (!rateLimits) {
    throw new CodexApiError("no_data", "Codex usage response did not contain rate-limit data.");
  }

  return {
    rateLimits,
    sourceFile: USAGE_URL,
    capturedAt: new Date(),
    source: "api",
  };
}

// ---------------------------------------------------------------------------
// Response normalisation
//
// The endpoint is undocumented and its shape has drifted between Codex
// releases, so we accept several layouts and map them onto the same
// `RateLimits` contract the rollout reader already produces.
// ---------------------------------------------------------------------------

function firstNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function normalizeWindow(raw: any): RateLimitWindow | null {
  if (!raw || typeof raw !== "object") return null;

  const usedPercent = firstNumber(raw.used_percent, raw.usedPercent, raw.pct, raw.percent);
  if (usedPercent === undefined) return null;

  let windowMinutes = firstNumber(raw.window_minutes, raw.windowMinutes, raw.limit_window_minutes);
  const windowSeconds = firstNumber(raw.window_seconds, raw.limit_window_seconds, raw.windowSeconds);
  if (windowMinutes === undefined && windowSeconds !== undefined) {
    windowMinutes = windowSeconds / 60;
  }

  const resetsAt = firstNumber(raw.resets_at, raw.resetsAt, raw.reset_at, raw.resetAt);
  const resetsInSeconds = firstNumber(
    raw.resets_in_seconds,
    raw.resetsInSeconds,
    raw.reset_after_seconds,
    raw.resetAfterSeconds,
  );

  const window: RateLimitWindow = { used_percent: usedPercent };
  if (windowMinutes !== undefined) window.window_minutes = windowMinutes;
  if (resetsAt !== undefined) window.resets_at = resetsAt;
  if (resetsInSeconds !== undefined) window.resets_in_seconds = resetsInSeconds;
  return window;
}

function normalizeCredits(raw: any): CreditsSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const hasCredits =
    typeof raw.has_credits === "boolean"
      ? raw.has_credits
      : typeof raw.hasCredits === "boolean"
        ? raw.hasCredits
        : undefined;
  const unlimited =
    typeof raw.unlimited === "boolean" ? raw.unlimited : undefined;
  const balance = firstString(raw.balance, raw.balance_display, raw.remaining);
  if (hasCredits === undefined && unlimited === undefined && balance === null) {
    return null;
  }
  return {
    has_credits: hasCredits ?? balance !== null,
    unlimited: unlimited ?? false,
    balance,
  };
}

function normalizeIndividualLimit(raw: any): SpendControlLimitSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const limit = firstString(raw.limit, raw.limit_display);
  const used = firstString(raw.used, raw.used_display);
  const remaining = firstNumber(raw.remaining_percent, raw.remainingPercent);
  const resetsAt = firstNumber(raw.resets_at, raw.resetsAt);
  if (limit === null || used === null || remaining === undefined || resetsAt === undefined) {
    return null;
  }
  return { limit, used, remaining_percent: remaining, resets_at: resetsAt };
}

function normalizeRateLimits(json: any): RateLimits | null {
  // The rate-limit block can live at a few different paths depending on the
  // Codex release. Probe the known containers in order of likelihood.
  const container =
    json?.rate_limits ??
    json?.rateLimits ??
    json?.rate_limit ??
    json?.usage?.rate_limits ??
    json;

  if (!container || typeof container !== "object") return null;

  const primary = normalizeWindow(
    container.primary ?? container.primary_window ?? container.primaryWindow,
  );
  const secondary = normalizeWindow(
    container.secondary ?? container.secondary_window ?? container.secondaryWindow,
  );
  const credits = normalizeCredits(container.credits ?? json?.credits);
  const individualLimit = normalizeIndividualLimit(
    container.individual_limit ?? container.individualLimit,
  );

  if (!primary && !secondary && !credits) return null;

  const planType = firstString(
    container.plan_type,
    container.planType,
    json?.plan_type,
    json?.plan?.name,
    json?.plan,
  );

  return {
    primary,
    secondary,
    credits,
    plan_type: planType,
    limit_id: firstString(container.limit_id, container.limitId),
    limit_name: firstString(container.limit_name, container.limitName),
    individual_limit: individualLimit,
    spend_control_reached:
      typeof container.spend_control_reached === "boolean"
        ? container.spend_control_reached
        : null,
    rate_limit_reached_type: firstString(
      container.rate_limit_reached_type,
      container.rateLimitReachedType,
    ),
  };
}
