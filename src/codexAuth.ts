import * as fs from "fs";
import * as path from "path";
import { resolveCodexHome } from "./codexReader";

// The credential Codex CLI writes to `~/.codex/auth.json` after `codex login`.
// We only ever read it; we never refresh or rewrite it (rotating a refresh
// token here could invalidate the user's real Codex login).
export interface CodexAuth {
  accessToken: string;
  accountId: string | null;
}

interface AuthFileTokens {
  id_token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  account_id?: string | null;
}

interface AuthFile {
  OPENAI_API_KEY?: string | null;
  tokens?: AuthFileTokens | null;
  last_refresh?: string | null;
}

export function resolveAuthPath(codexHome?: string): string {
  return path.join(resolveCodexHome(codexHome), "auth.json");
}

// Decode a JWT payload without verifying its signature. Codex embeds the
// ChatGPT account id in the id/access token claims, so this is the fallback
// when auth.json does not carry `account_id` directly.
function decodeJwtPayload(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function accountIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const claims = decodeJwtPayload(token);
  if (!claims) return null;
  const auth = claims["https://api.openai.com/auth"];
  const nested =
    auth && typeof auth === "object" ? auth["chatgpt_account_id"] : undefined;
  const candidate = claims["chatgpt_account_id"] ?? nested;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

// Returns the logged-in Codex credential, or null when the user is not logged
// in (no auth.json, no OAuth tokens, or an unreadable file). API-key-only
// installs (no `tokens`) return null because the usage endpoint needs the
// ChatGPT OAuth access token.
export function readCodexAuth(codexHome?: string): CodexAuth | null {
  const authPath = resolveAuthPath(codexHome);
  let raw: string;
  try {
    raw = fs.readFileSync(authPath, "utf8");
  } catch {
    return null;
  }

  let parsed: AuthFile;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const tokens = parsed.tokens ?? null;
  const accessToken = tokens?.access_token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  const accountId =
    (typeof tokens?.account_id === "string" && tokens.account_id.length > 0
      ? tokens.account_id
      : null) ??
    accountIdFromToken(tokens?.id_token) ??
    accountIdFromToken(accessToken);

  return { accessToken, accountId };
}

export function isLoggedIn(codexHome?: string): boolean {
  return readCodexAuth(codexHome) !== null;
}
