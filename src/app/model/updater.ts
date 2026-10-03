import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { announceUpdateAvailable } from "../../features/settings/model/sounds";
import { alertApp } from "./appDialog";
import { APP_UPDATER_DISABLED } from "./forkPolicy";
import { formatUpdateDate } from "./releaseNotes";
import { openUpdatePrompt } from "./updatePrompt";
import { rememberInstalledUpdate } from "./updateNotice";

const FORK_UPDATER_DISABLED_MESSAGE =
  "App updates are disabled in this fork so upstream builds cannot overwrite it.\n\nPull upstream with git, or build and install from this repository.";

export type UpdaterPhase =
  "idle" | "checking" | "current" | "available" | "downloading" | "error";

export type UpdaterSnapshot = {
  phase: UpdaterPhase;
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
};

// A stalled request would otherwise pin the phase at "checking" until restart.
const UPDATE_CHECK_TIMEOUT_MS = 30_000;

let pendingUpdate: Update | null = null;
// Several surfaces (sidebar, Settings, app menu) can start an install, each with
// its own snapshot, so the guard against a second download lives here.
let installInFlight = false;

function isUpdaterNotConfiguredError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /updater does not have any endpoints set/i.test(text);
}

export async function readAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.0.0";
  }
}

export async function probeForUpdate(): Promise<Update | null> {
  if (APP_UPDATER_DISABLED) {
    pendingUpdate = null;
    return null;
  }

  if (installInFlight) return null;

  const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
  pendingUpdate = update;
  if (update) announceUpdateAvailable(update.version);
  return update;
}

export async function runUpdateFlow(
  manual: boolean,
  onProgress?: (snapshot: UpdaterSnapshot) => void,
): Promise<UpdaterSnapshot> {
  const currentVersion = await readAppVersion();

  if (APP_UPDATER_DISABLED) {
    pendingUpdate = null;

    const idle: UpdaterSnapshot = { phase: "idle", currentVersion };
    onProgress?.(idle);

    if (manual) {
      await alertApp(FORK_UPDATER_DISABLED_MESSAGE);
    }

    return idle;
  }

  // A re-check would swap `pendingUpdate` under the running download.
  if (installInFlight) {
    if (manual) {
      await alertApp(
        "An update is already downloading. Vatra will restart when it's ready.",
      );
    }

    return {
      phase: "downloading",
      currentVersion,
      availableVersion: pendingUpdate?.version,
    };
  }

  const base: UpdaterSnapshot = { phase: "checking", currentVersion };
  onProgress?.(base);

  try {
    const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
    if (!update) {
      pendingUpdate = null;
      const current: UpdaterSnapshot = { phase: "current", currentVersion };
      onProgress?.(current);
      if (manual) {
        await alertApp("You're on the latest version.");
      }
      return current;
    }

    pendingUpdate = update;
    announceUpdateAvailable(update.version);
    const available: UpdaterSnapshot = {
      phase: "available",
      currentVersion,
      availableVersion: update.version,
    };
    onProgress?.(available);

    if (!manual) return available;

    openUpdatePrompt({
      version: update.version,
      currentVersion,
      date: formatUpdateDate(update.date),
      notes: update.body?.trim() || null,
      onProgress,
    });
    return available;
  } catch (err) {
    if (isUpdaterNotConfiguredError(err)) {
      pendingUpdate = null;
      const idle: UpdaterSnapshot = { phase: "idle", currentVersion };
      onProgress?.(idle);
      if (manual) {
        await alertApp(
          "Automatic updates aren't configured for this build.\n\nDownload releases at https://github.com/deluminor/vatra/releases/latest",
        );
      }
      return idle;
    }

    const error = err instanceof Error ? err.message : String(err);
    const failed: UpdaterSnapshot = { phase: "error", currentVersion, error };
    onProgress?.(failed);
    if (manual) {
      await alertApp(`Couldn't check for updates.\n\n${error}`, {
        kind: "error",
      });
    }
    return failed;
  }
}

type InstallOptions = {
  reportFailure?: boolean;
  /** Refuse to install unless the pending update is still this version. */
  version?: string;
};

export async function installPendingUpdate(
  onProgress?: (snapshot: UpdaterSnapshot) => void,
  { reportFailure = true, version }: InstallOptions = {},
): Promise<UpdaterSnapshot> {
  const currentVersion = await readAppVersion();

  if (APP_UPDATER_DISABLED) {
    pendingUpdate = null;

    const idle: UpdaterSnapshot = { phase: "idle", currentVersion };
    onProgress?.(idle);

    return idle;
  }

  const update = pendingUpdate;
  if (version && update?.version !== version) {
    const stale: UpdaterSnapshot = {
      phase: "error",
      currentVersion,
      availableVersion: update?.version,
      error: `Vatra ${version} is no longer the pending update. Check for updates again.`,
    };
    onProgress?.(stale);

    return stale;
  }

  if (!update) {
    const idle: UpdaterSnapshot = { phase: "idle", currentVersion };
    onProgress?.(idle);
    return idle;
  }

  const downloading: UpdaterSnapshot = {
    phase: "downloading",
    currentVersion,
    availableVersion: update.version,
    progress: 0,
  };
  if (installInFlight) return downloading;

  installInFlight = true;
  let downloaded = 0;
  let contentLength = 0;
  onProgress?.(downloading);

  try {
    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength ?? 0;
        downloaded = 0;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
      }

      const progress =
        contentLength > 0
          ? Math.min(100, Math.round((downloaded / contentLength) * 100))
          : undefined;

      onProgress?.({
        phase: "downloading",
        currentVersion,
        availableVersion: update.version,
        progress,
      });
    });

    rememberInstalledUpdate(update.version);
    pendingUpdate = null;
    await relaunch();
    return {
      phase: "current",
      currentVersion: update.version,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failed: UpdaterSnapshot = {
      phase: "error",
      currentVersion,
      availableVersion: update.version,
      error,
    };
    onProgress?.(failed);
    if (reportFailure) {
      await alertApp(`Couldn't install the update.\n\n${error}`, {
        kind: "error",
      });
    }

    return failed;
  } finally {
    installInFlight = false;
  }
}
