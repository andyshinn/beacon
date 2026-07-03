/**
 * In-app auto-update wiring. Kept dependency-injected (like installPowerEvents)
 * so the gating logic is unit-testable without electron or update-electron-app.
 * main.ts supplies the real electron `app.isPackaged` and the updateElectronApp
 * call, which reads the repository from package.json and polls update.electronjs.org.
 */
export interface AutoUpdateDeps {
	/** electron app.isPackaged — false under `electron-forge start` and in tests. */
	isPackaged: boolean;
	/** Starts the updater (wraps updateElectronApp()); only invoked when packaged. */
	start: () => void;
	/** Optional log sink; defaults to console.log. */
	log?: (message: string) => void;
}

/**
 * Starts auto-update only for packaged builds. Returns true if the updater was
 * started, false if skipped (dev/unpackaged). Never throws.
 */
export function initAutoUpdate(deps: AutoUpdateDeps): boolean {
	const log = deps.log ?? ((m: string) => console.log(m));
	if (!deps.isPackaged) {
		log("[beacon] auto-update skipped (not packaged)");
		return false;
	}
	deps.start();
	log("[beacon] auto-update started");
	return true;
}
