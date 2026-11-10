import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, nativeTheme, type Rectangle, screen } from "electron";
import { updateElectronApp } from "update-electron-app";
import { IPC } from "../shared/ipc";
import { type AppearanceIo, applyAppearance, loadAppearance, windowBackground } from "./appearance";
import { initAutoUpdate } from "./autoUpdate";
import { installAppMenu } from "./installAppMenu";
import { registerDiscoveryIpc } from "./ipc/registerDiscoveryIpc";
import { loadWindowState, manageWindow, type WindowStateIo } from "./windowState";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// ESM-safe __dirname (package.json has "type": "module"). Vite rewrites
// import.meta.url correctly whether the main bundle is emitted as ESM or CJS.
const dirname = path.dirname(fileURLToPath(import.meta.url));

function userDataFile(name: string): AppearanceIo {
  const file = path.join(app.getPath("userData"), name);
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
  };
}

function windowStateIo(): WindowStateIo {
  return {
    ...userDataFile("window-state.json"),
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
    // Stay hidden until the first frame is painted, over a background matching the
    // theme, so launch never shows an empty white (or wrong-theme) window.
    show: false,
    backgroundColor: windowBackground(nativeTheme),
    titleBarStyle: isMac ? "hiddenInset" : "default",
    // hiddenInset positions the traffic lights for a standard ~28px title bar;
    // nudge them down to sit centered in our taller 46px toolbar (.bcn-toolbar
    // height) and inset them from the window edge the way Safari's unified
    // toolbar does. Keep --toolbar-leading-inset (tokens.css) in step with x.
    trafficLightPosition: isMac ? { x: 20, y: 16 } : undefined,
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
  let shown = false;
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    // maximize() shows the window on Windows/Linux, so it has to wait until now too.
    if (saved.isMaximized) win.maximize();
    win.show();
  };
  win.once("ready-to-show", reveal);
  // ready-to-show needs a painted frame; a failed load must not leave the app invisible.
  win.webContents.once("did-fail-load", reveal);
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
  // Theme the native chrome (menus, dialogs, Windows/Linux title bar) from the
  // last-known choice before the window exists; the renderer re-sends it on load.
  const appearanceIo = userDataFile("appearance.json");
  nativeTheme.themeSource = loadAppearance(appearanceIo);
  ipcMain.on(IPC.setAppearance, (_e, value: unknown) => {
    applyAppearance(value, nativeTheme, appearanceIo);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
