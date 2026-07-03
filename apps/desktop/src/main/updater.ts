import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from "electron-updater";
import type { AppUpdateStatus } from "@customer-agent/core";

let updateStatus: AppUpdateStatus = {
  state: app.isPackaged ? "idle" : "disabled",
  version: app.getVersion(),
  enabled: app.isPackaged,
};

let updaterConfigured = false;

export function getAppUpdateStatus(): AppUpdateStatus {
  return { ...updateStatus };
}

export function setupAppUpdater(): void {
  if (updaterConfigured) {
    return;
  }
  updaterConfigured = true;

  if (!app.isPackaged) {
    setUpdateStatus({
      state: "disabled",
      version: app.getVersion(),
      enabled: false,
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateStatus({ state: "checking", version: app.getVersion(), enabled: true });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    setUpdateStatus({
      state: "available",
      version: app.getVersion(),
      enabled: true,
      latestVersion: info.version,
    });
  });

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    setUpdateStatus({
      state: "not-available",
      version: app.getVersion(),
      enabled: true,
      latestVersion: info.version,
    });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    setUpdateStatus({
      state: "downloading",
      version: app.getVersion(),
      enabled: true,
      ...optionalString("latestVersion", updateStatus.latestVersion),
      percent: progress.percent,
      transferredBytes: progress.transferred,
      totalBytes: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (event: UpdateDownloadedEvent) => {
    setUpdateStatus({
      state: "downloaded",
      version: app.getVersion(),
      enabled: true,
      latestVersion: event.version,
    });
  });

  autoUpdater.on("error", (error) => {
    setUpdateStatus({
      state: "error",
      version: app.getVersion(),
      enabled: true,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  if (!app.isPackaged) {
    setUpdateStatus({
      state: "disabled",
      version: app.getVersion(),
      enabled: false,
      error: "自动更新仅在安装包中启用。",
    });
    return getAppUpdateStatus();
  }

  setupAppUpdater();
  try {
    setUpdateStatus({ state: "checking", version: app.getVersion(), enabled: true });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateStatus({
      state: "error",
      version: app.getVersion(),
      enabled: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return getAppUpdateStatus();
}

export function installDownloadedAppUpdate(): { ok: boolean; error?: string } {
  if (updateStatus.state !== "downloaded") {
    return { ok: false, error: "还没有下载完成的新版本。" };
  }
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}

function setUpdateStatus(status: AppUpdateStatus): void {
  updateStatus = status;
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("app.update.status", getAppUpdateStatus());
  }
}

function optionalString<TKey extends string>(key: TKey, value: string | undefined): { [K in TKey]?: string } {
  return value === undefined ? {} : { [key]: value } as { [K in TKey]?: string };
}
