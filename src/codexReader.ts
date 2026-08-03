import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { RateLimits, Snapshot } from "./types";

export interface ReaderOptions {
  codexHome?: string;
  lookbackDays?: number;
}

export function resolveCodexHome(codexHome?: string): string {
  if (codexHome && codexHome.trim().length > 0) {
    if (codexHome.startsWith("~")) {
      return path.join(os.homedir(), codexHome.slice(1));
    }
    return codexHome;
  }
  return path.join(os.homedir(), ".codex");
}

interface RolloutFile {
  fullPath: string;
  mtimeMs: number;
}

function listRolloutFiles(sessionsDir: string, lookbackDays: number): RolloutFile[] {
  const out: RolloutFile[] = [];
  const now = new Date();
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(now.getTime() - i * 86400 * 1000);
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const dayDir = path.join(sessionsDir, yyyy, mm, dd);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dayDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.startsWith("rollout-") || !e.name.endsWith(".jsonl")) continue;
      const fullPath = path.join(dayDir, e.name);
      try {
        const stat = fs.statSync(fullPath);
        out.push({ fullPath, mtimeMs: stat.mtimeMs });
      } catch {
        // ignore
      }
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

function extractRateLimits(line: string): RateLimits | null {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  const payload = obj?.payload ?? obj;
  if (payload?.type !== "token_count") return null;
  const rl = payload?.rate_limits;
  if (!rl) return null;
  const primary = rl.primary ?? null;
  const secondary = rl.secondary ?? null;
  const credits = rl.credits ?? null;
  if (!primary && !secondary && !credits) return null;
  return {
    primary,
    secondary,
    credits,
    plan_type: typeof rl.plan_type === "string" ? rl.plan_type : null,
    limit_id: typeof rl.limit_id === "string" ? rl.limit_id : null,
    limit_name: typeof rl.limit_name === "string" ? rl.limit_name : null,
    individual_limit: rl.individual_limit ?? null,
    spend_control_reached: typeof rl.spend_control_reached === "boolean" ? rl.spend_control_reached : null,
    rate_limit_reached_type:
      typeof rl.rate_limit_reached_type === "string" ? rl.rate_limit_reached_type : null,
  };
}

async function lastRateLimitsInFile(filePath: string): Promise<RateLimits | null> {
  // Sessions can be long; scan line-by-line and keep the last hit.
  // Cheaper than loading the whole file when files get big.
  return new Promise((resolve, reject) => {
    let latest: RateLimits | null = null;
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const extracted = extractRateLimits(line);
      if (extracted) latest = extracted;
    });
    rl.on("close", () => resolve(latest));
    rl.on("error", reject);
    stream.on("error", reject);
  });
}

export async function readLatestSnapshot(opts: ReaderOptions = {}): Promise<Snapshot | null> {
  const home = resolveCodexHome(opts.codexHome);
  const sessionsDir = path.join(home, "sessions");
  const lookback = Math.max(1, opts.lookbackDays ?? 7);

  const files = listRolloutFiles(sessionsDir, lookback);
  for (const f of files) {
    const rl = await lastRateLimitsInFile(f.fullPath);
    if (rl) {
      return {
        rateLimits: rl,
        sourceFile: f.fullPath,
        capturedAt: new Date(f.mtimeMs),
        source: "rollout",
      };
    }
  }
  return null;
}
