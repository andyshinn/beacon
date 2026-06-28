import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { registerDiscoveryIpc } from "./ipc/registerDiscoveryIpc";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// ESM-safe __dirname (package.json has "type": "module"). Vite rewrites
// import.meta.url correctly whether the main bundle is emitted as ESM or CJS.
const dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
	const isMac = process.platform === "darwin";
	const win = new BrowserWindow({
		width: 1100,
		height: 720,
		titleBarStyle: isMac ? "hiddenInset" : "default",
		// hiddenInset positions the traffic lights for a standard ~28px title bar;
		// nudge them down/right to sit centered in our taller 46px toolbar
		// (.bcn-toolbar height) and align with the design mockup.
		trafficLightPosition: isMac ? { x: 13, y: 16 } : undefined,
		webPreferences: {
			preload: path.join(dirname, "preload.js"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	registerDiscoveryIpc(win);
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		void win.loadFile(path.join(dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
	}
}

app.whenReady().then(() => {
	console.log("[beacon] main process ready");
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
