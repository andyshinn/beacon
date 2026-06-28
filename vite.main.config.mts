import { defineConfig } from "vite";
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
	},
	resolve: { conditions: ["node"], mainFields: ["module", "jsnext:main", "jsnext"] },
});
