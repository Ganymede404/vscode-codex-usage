import * as vscode from "vscode";
import { readLatestSnapshot } from "./codexReader";
import { CodexApiError, readApiSnapshot } from "./codexApi";
import { isLoggedIn } from "./codexAuth";
import {
  createMoreInformationItems,
  createUsageSummaryItems,
  isMoreInformationItem,
  StatusBar,
  StatusBarSide,
} from "./statusBar";
import { Snapshot } from "./types";

type UsageSource = "auto" | "api" | "rollout";

let timer: NodeJS.Timeout | undefined;
let statusBar: StatusBar | undefined;
let lastSnapshot: Snapshot | null = null;
let lastNote: string | undefined;

function getConfig() {
  const c = vscode.workspace.getConfiguration("codexUsage");
  const source = c.get<string>("source", "auto");
  const side = c.get<string>("statusBarAlignment", "left");
  return {
    codexHome: c.get<string>("codexHome", ""),
    refreshIntervalSeconds: c.get<number>("refreshIntervalSeconds", 60),
    lookbackDays: c.get<number>("lookbackDays", 7),
    source: (["auto", "api", "rollout"].includes(source) ? source : "auto") as UsageSource,
    compact: c.get<boolean>("compactStatusBar", false),
    statusBarAlignment: (side === "right" ? "right" : "left") as StatusBarSide,
  };
}

async function readRollout(cfg: ReturnType<typeof getConfig>): Promise<Snapshot | null> {
  return readLatestSnapshot({
    codexHome: cfg.codexHome,
    lookbackDays: cfg.lookbackDays,
  });
}

// Resolve a snapshot according to the configured source. Online modes fall back
// to the local rollout files whenever the live query can't run (not logged in,
// expired token, offline), so the status bar keeps working.
async function resolveSnapshot(
  cfg: ReturnType<typeof getConfig>,
): Promise<{ snapshot: Snapshot | null; note?: string }> {
  const wantApi = cfg.source === "api" || (cfg.source === "auto" && isLoggedIn(cfg.codexHome));
  if (!wantApi) {
    return { snapshot: await readRollout(cfg) };
  }

  try {
    return { snapshot: await readApiSnapshot({ codexHome: cfg.codexHome }) };
  } catch (err) {
    const reason = err instanceof CodexApiError ? err.message : String(err);
    console.warn("[codex-usage] API query failed, falling back to rollout:", reason);
    const snapshot = await readRollout(cfg);
    const note = snapshot
      ? `Live query unavailable — showing latest rollout snapshot. ${reason}`
      : reason;
    return { snapshot, note };
  }
}

async function refresh() {
  if (!statusBar) return;
  const cfg = getConfig();
  statusBar.ensureAlignment(cfg.statusBarAlignment);
  try {
    const result = await resolveSnapshot(cfg);
    lastSnapshot = result.snapshot;
    lastNote = result.note;
  } catch (err) {
    lastSnapshot = null;
    lastNote = undefined;
    console.error("[codex-usage] read failed:", err);
  }
  statusBar.update(lastSnapshot, { compact: cfg.compact, note: lastNote });
}

function restartTimer() {
  if (timer) clearInterval(timer);
  const cfg = getConfig();
  const intervalMs = Math.max(5, cfg.refreshIntervalSeconds) * 1000;
  timer = setInterval(refresh, intervalMs);
}

async function showUsage() {
  if (!lastSnapshot) {
    await vscode.window.showInformationMessage(
      "No Codex rollout files found. Start a Codex session to populate usage.",
    );
    return;
  }

  const selected = await vscode.window.showQuickPick(createUsageSummaryItems(lastSnapshot), {
    title: "Codex Usage",
    placeHolder: "Current session and weekly rate limits",
  });
  if (isMoreInformationItem(selected)) {
    await showMoreInformation();
  }
}

async function showMoreInformation() {
  if (!lastSnapshot) {
    await vscode.window.showInformationMessage(
      "No Codex rollout files found. Start a Codex session to populate usage.",
    );
    return;
  }

  await vscode.window.showQuickPick(createMoreInformationItems(lastSnapshot, lastNote), {
    title: "Codex Usage - More Information",
    placeHolder: "Captured time, source file, and rate-limit windows",
  });
}

export function activate(context: vscode.ExtensionContext) {
  statusBar = new StatusBar(getConfig().statusBarAlignment);
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand("codexUsage.refresh", refresh),
    vscode.commands.registerCommand("codexUsage.showUsage", showUsage),
    vscode.commands.registerCommand("codexUsage.showDetails", showUsage),
    vscode.commands.registerCommand("codexUsage.showMoreInformation", showMoreInformation),
    vscode.commands.registerCommand("codexUsage.openSessionsFolder", async () => {
      const cfg = getConfig();
      const { resolveCodexHome } = await import("./codexReader");
      const home = resolveCodexHome(cfg.codexHome);
      const uri = vscode.Uri.file(`${home}/sessions`);
      await vscode.commands.executeCommand("revealFileInOS", uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("codexUsage")) return;
      restartTimer();
      void refresh();
    }),
  );

  restartTimer();
  void refresh();
}

export function deactivate() {
  if (timer) clearInterval(timer);
  statusBar?.dispose();
}
