// The @electron-forge/plugin-vite plugin defaults packagerConfig.ignore to
// `(file) => !file.startsWith("/.vite")`, which strips ALL of node_modules from the
// packaged app. Our main bundle is ESM and externalizes bonjour-service (see
// esm-build-constraints / vite.main.config.mts), so the dependency must ship UNBUNDLED
// or the externalized `import "bonjour-service"` cannot resolve once the .app leaves the
// source tree — discovery then silently never starts. keepInPackage() is the inverse of
// Forge's ignore: it keeps the Vite output, the root package.json, and exactly the
// bonjour-service runtime closure. Verified on Electron 42.5.0 that these pure-JS packages
// resolve via ESM from INSIDE app.asar (no asar.unpack). If bonjour-service's dependency
// tree changes, update RUNTIME_DEPS; scripts/smoke-package.sh catches a missing member.
export const RUNTIME_DEPS = [
	"bonjour-service",
	"multicast-dns",
	"dns-packet",
	"thunky",
	"fast-deep-equal",
	"@leichtgewicht/ip-codec",
	// update-electron-app auto-update closure. Externalized in vite.main.config.mts
	// (CJS, requires electron/builtins), so it must ship unbundled like bonjour-service.
	"update-electron-app",
	"github-url-to-object",
	"is-url",
	"ms",
] as const;

export function keepInPackage(file: string): boolean {
	if (!file) return true; // packager probes the root with "" — mirror Forge's keep
	if (file.startsWith("/.vite")) return true;
	if (file === "/package.json") return true;
	if (file === "/node_modules") return true; // keep the dir entry so packager descends
	for (const dep of RUNTIME_DEPS) {
		const base = `/node_modules/${dep}`;
		if (file === base || file.startsWith(`${base}/`)) return true;
		if (dep.startsWith("@")) {
			const scope = `/node_modules/${dep.slice(0, dep.indexOf("/"))}`;
			if (file === scope) return true; // keep the scope dir entry so packager descends
		}
	}
	return false;
}
