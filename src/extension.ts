import * as vscode from "vscode";
import { readLatestSnapshot } from "./codexReader";
import {
  createMoreInformationItems,
  createUsageSummaryItems,
  isMoreInformationItem,
  StatusBar,
} from "./statusBar";
import { Snapshot } from "./types";

let timer: NodeJS.Timeout | undefined;
let statusBar: StatusBar | undefined;
let lastSnapshot: Snapshot | null = null;

function getConfig() {
  const c = vscode.workspace.getConfiguration("codexUsage");
  return {
    codexHome: c.get<string>("codexHome", ""),
    refreshIntervalSeconds: c.get<number>("refreshIntervalSeconds", 60),
    lookbackDays: c.get<number>("lookbackDays", 7),
  };
}

async function refresh() {
  if (!statusBar) return;
  const cfg = getConfig();
  try {
    lastSnapshot = await readLatestSnapshot({
      codexHome: cfg.codexHome,
      lookbackDays: cfg.lookbackDays,
    });
  } catch (err) {
    lastSnapshot = null;
    console.error("[codex-usage] read failed:", err);
  }
  statusBar.update(lastSnapshot);
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

  await vscode.window.showQuickPick(createMoreInformationItems(lastSnapshot), {
    title: "Codex Usage - More Information",
    placeHolder: "Captured time, source file, and rate-limit windows",
  });
}

export function activate(context: vscode.ExtensionContext) {
  statusBar = new StatusBar();
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
