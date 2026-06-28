import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: "node",
					environment: "node",
					include: ["src/main/**/*.test.{ts,tsx}", "src/shared/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
				},
			},
			{
				test: {
					name: "renderer",
					environment: "happy-dom",
					include: ["src/renderer/**/*.test.{ts,tsx}"],
					setupFiles: ["src/renderer/test-setup.ts"],
				},
			},
		],
	},
});
