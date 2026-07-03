import { type BrowserWindow, ipcMain, powerMonitor, shell } from "electron";
import { IPC } from "../../shared/ipc";
import type { ManagerEvent } from "../discovery/DiscoveryManager";
import { DiscoveryManager } from "../discovery/DiscoveryManager";
import { LocalNetworkHealthCheck } from "../discovery/permissionHealth";
import { BonjourSource } from "../discovery/sources/BonjourSource";
import { installPowerEvents } from "../powerEvents";

export function registerDiscoveryIpc(win: BrowserWindow): void {
  const wc = win.webContents;
  let ready = false;
  let hasLoadedOnce = false;
  const pending: Array<{ channel: string; payload: unknown }> = [];

  const push = (channel: string, payload: unknown): void => {
    if (wc.isDestroyed()) return;
    if (!ready) {
      pending.push({ channel, payload });
      return;
    }
    wc.send(channel, payload);
  };

  const onEvent = (e: ManagerEvent): void => {
    if (e.type === "snapshot") push(IPC.snapshot, e.snapshot);
    else if (e.type === "delta") push(IPC.delta, e.delta);
    else if (e.type === "status") push(IPC.status, e.status);
    else push(IPC.health, e.health);
  };

  const manager = new DiscoveryManager({
    source: new BonjourSource(),
    onEvent,
    healthCheck: new LocalNetworkHealthCheck({ enabled: process.platform === "darwin" }),
  });

  const teardownPower = installPowerEvents({
    powerMonitor,
    isLive: () => manager.getStatus().live,
    restart: () => manager.restartSource(),
  });

  // Commands. NOTE: ipcMain.handle is process-global while the manager is per-window.
  // Beacon is single-window; the "closed" cleanup below removes these handlers, and
  // main.ts's activate guard only recreates a window when none exist, so close->reopen
  // re-registers cleanly. A future multi-window build (Plan 3/4) must route per-window
  // or use a shared singleton manager instead of re-registering globals.
  ipcMain.handle(IPC.rescan, () => manager.rescan());
  ipcMain.handle(IPC.setLive, (_e, on: unknown) => manager.setLive(Boolean(on)));
  ipcMain.handle(IPC.resolve, (_e, key: unknown) => {
    if (typeof key === "string") manager.resolve(key);
  });
  ipcMain.handle(IPC.getSnapshot, () => manager.getSnapshot());
  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
  ipcMain.handle(IPC.openLocalNetworkSettings, async () => {
    // macOS deep link to System Settings → Privacy & Security → Local Network.
    await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork");
  });

  // Readiness: buffer until first load; re-snapshot on reload.
  wc.on("did-start-navigation", (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) ready = false;
  });
  wc.on("did-finish-load", () => {
    ready = true;
    if (!hasLoadedOnce) {
      // First load: flush the initial snapshot/status buffered from manager.start().
      hasLoadedOnce = true;
      for (const m of pending.splice(0)) if (!wc.isDestroyed()) wc.send(m.channel, m.payload);
    } else {
      // Reload: the renderer store was reset to its defaults (status.live: false).
      // Discard deltas buffered during the navigation gap (they are relative to the
      // old state) and resend a fresh snapshot AND the current status so the rebuilt
      // store matches the manager. Omitting the status here desynced the two — the
      // renderer showed "Paused" while the manager was live, and resume was a no-op
      // because setLive(true) early-returns when already live. The common trigger is
      // Vite's first-run dependency-optimize reload, which lands on this branch.
      pending.length = 0;
      if (!wc.isDestroyed()) {
        wc.send(IPC.snapshot, manager.getSnapshot());
        wc.send(IPC.status, manager.getStatus());
      }
    }
  });

  win.on("closed", () => {
    teardownPower();
    manager.stop();
    for (const ch of [
      IPC.rescan,
      IPC.setLive,
      IPC.resolve,
      IPC.getSnapshot,
      IPC.openExternal,
      IPC.openLocalNetworkSettings,
    ]) {
      ipcMain.removeHandler(ch);
    }
  });

  manager.start(); // emits initial snapshot + status synchronously (buffered until load)
}
