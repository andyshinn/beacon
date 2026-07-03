import { builtinModules } from "node:module";
import { defineConfig } from "vite";

// CommonJS deps (e.g. bonjour-service → multicast-dns) must NOT be bundled into
// the ESM main bundle: rolldown wraps them in __commonJSMin and rewrites their
// internal require("os"/"dgram"/…) to a __require shim that throws in ESM scope
// ("require is not defined"). Keeping them external emits a plain ESM import and
// lets Node load them from node_modules (electron + node builtins are external
// for the same reason). The package stays runnable because it's listed under
// package.json "dependencies", so Forge ships it unbundled into the app.
const external = [
	"electron",
	"bonjour-service",
	"update-electron-app",
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
	// Defining build.lib ourselves stops @electron-forge/plugin-vite from
	// injecting its default `formats: ['cjs']` (which emits require() calls that
	// crash under package.json "type": "module"). Emit ESM instead.
	build: {
		lib: {
			entry: "src/main/main.ts",
			fileName: () => "[name].js",
			formats: ["es"],
		},
		rollupOptions: { external },
	},
	resolve: { conditions: ["node"], mainFields: ["module", "jsnext:main", "jsnext"] },
});
