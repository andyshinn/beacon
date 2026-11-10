import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, type Rectangle, screen } from "electron";
import { updateElectronApp } from "update-electron-app";
import { initAutoUpdate } from "./autoUpdate";
import { installAppMenu } from "./installAppMenu";
import { registerDiscoveryIpc } from "./ipc/registerDiscoveryIpc";
import { loadWindowState, manageWindow, type WindowStateIo } from "./windowState";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// ESM-safe __dirname (package.json has "type": "module"). Vite rewrites
// import.meta.url correctly whether the main bundle is emitted as ESM or CJS.
const dirname = path.dirname(fileURLToPath(import.meta.url));

function windowStateIo(): WindowStateIo {
  const file = path.join(app.getPath("userData"), "window-state.json");
  return {
    read: () => {
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    write: (data) => {
      try {
        fs.writeFileSync(file, data);
      } catch {
        /* best-effort: a failed save must never crash the window */
      }
    },
    isOnScreen: (rect: Rectangle) => {
      try {
        const area = screen.getDisplayMatching(rect).workArea;
        return (
          rect.x < area.x + area.width &&
          rect.x + rect.width > area.x &&
          rect.y < area.y + area.height &&
          rect.y + rect.height > area.y
        );
      } catch {
        return true;
      }
    },
  };
}

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const io = windowStateIo();
  const saved = loadWindowState(io);
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    // hiddenInset positions the traffic lights for a standard ~28px title bar;
    // nudge them down/right to sit centered in our taller 46px toolbar
    // (.bcn-toolbar height) and align with the design mockup.
    trafficLightPosition: isMac ? { x: 13, y: 16 } : undefined,
    webPreferences: {
      preload: path.join(dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Electron only emits the macOS "swipe" event when scrollBounce is enabled;
      // without it the win.on("swipe", …) handler below never fires.
      scrollBounce: true,
    },
  });
  if (saved.isMaximized) win.maximize();
  manageWindow(win, io);
  // OS-level navigation gestures funnel into the same Chromium history stack the
  // renderer drives via the History API, so each fires the renderer's popstate.
  const goBack = () => {
    if (win.webContents.navigationHistory.canGoBack()) win.webContents.navigationHistory.goBack();
  };
  const goForward = () => {
    if (win.webContents.navigationHistory.canGoForward()) win.webContents.navigationHistory.goForward();
  };
  win.on("app-command", (_e, command) => {
    if (command === "browser-backward") goBack();
    else if (command === "browser-forward") goForward();
  });
  win.on("swipe", (_e, direction) => {
    if (direction === "left") goBack();
    else if (direction === "right") goForward();
  });
  registerDiscoveryIpc(win);
  const disposeMenu = installAppMenu(win);
  win.on("closed", () => disposeMenu());
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

app.whenReady().then(() => {
  console.log("[beacon] main process ready");
  app.setAboutPanelOptions({
    applicationName: "Beacon",
    applicationVersion: app.getVersion(),
    copyright: "© 2026 Andy Shinn",
    credits: "mDNS / Bonjour / DNS-SD discovery browser",
  });
  // Auto-update against update.electronjs.org (packaged builds only; no-ops in dev).
  initAutoUpdate({ isPackaged: app.isPackaged, start: () => updateElectronApp() });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
