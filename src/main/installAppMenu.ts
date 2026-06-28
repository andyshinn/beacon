import { app, type BrowserWindow, ipcMain, Menu } from "electron";
import { IPC, type MenuCommand, type MenuStatePayload } from "../shared/ipc";
import { buildMenuTemplate, type MenuState } from "./appMenu";

// Builds the application menu and keeps it in sync. `live`/`viewMode` come from the
// renderer over IPC; nav enablement is read from the window's Chromium history stack.
// Rebuild-and-set on every change (cheap, and keeps buildMenuTemplate pure/testable).
export function installAppMenu(win: BrowserWindow): () => void {
	app.setAboutPanelOptions({
		applicationName: app.getName(),
		applicationVersion: app.getVersion(),
		version: app.getVersion(),
	});

	const nav = () => win.webContents.navigationHistory;
	const state: MenuState = {
		live: true,
		viewMode: "service",
		canGoBack: nav().canGoBack(),
		canGoForward: nav().canGoForward(),
	};

	const rebuild = (): void => {
		const template = buildMenuTemplate(state, {
			platform: process.platform,
			appName: app.getName(),
			onCommand: (c: MenuCommand) => {
				if (!win.isDestroyed()) win.webContents.send(IPC.menuCommand, c);
			},
			onBack: () => {
				if (nav().canGoBack()) nav().goBack();
				// Explicit refreshNav() is intentional: the OS-gesture / app-command Back/Forward
				// paths wired in main.ts bypass this closure, so rebuild is also called here.
				// It is idempotent and cheap.
				refreshNav();
			},
			onForward: () => {
				if (nav().canGoForward()) nav().goForward();
				// Same reasoning as onBack above.
				refreshNav();
			},
		});
		Menu.setApplicationMenu(Menu.buildFromTemplate(template));
	};

	const refreshNav = (): void => {
		if (win.isDestroyed()) return;
		state.canGoBack = nav().canGoBack();
		state.canGoForward = nav().canGoForward();
		rebuild();
	};

	const onMenuState = (_e: unknown, payload: MenuStatePayload): void => {
		state.live = payload.live;
		state.viewMode = payload.mode;
		rebuild();
	};
	ipcMain.on(IPC.menuState, onMenuState);

	const onNav = (): void => refreshNav();
	win.webContents.on("did-navigate-in-page", onNav);

	rebuild();

	return () => {
		ipcMain.removeListener(IPC.menuState, onMenuState);
		if (!win.isDestroyed()) win.webContents.removeListener("did-navigate-in-page", onNav);
	};
}
