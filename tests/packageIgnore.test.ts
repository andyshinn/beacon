import { describe, expect, it } from "vitest";
import { keepInPackage, RUNTIME_DEPS } from "../scripts/packageIgnore";

describe("keepInPackage", () => {
	it("keeps the Vite build output", () => {
		expect(keepInPackage("/.vite/build/main.js")).toBe(true);
		expect(keepInPackage("/.vite/renderer/main_window/index.html")).toBe(true);
	});

	it("keeps the root package.json", () => {
		expect(keepInPackage("/package.json")).toBe(true);
	});

	it("keeps the node_modules dir entry so packager descends into it", () => {
		expect(keepInPackage("/node_modules")).toBe(true);
	});

	it("keeps every runtime-closure package", () => {
		expect(keepInPackage("/node_modules/bonjour-service/dist/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/multicast-dns/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/dns-packet/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/thunky/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/fast-deep-equal/index.js")).toBe(true);
	});

	it("keeps a scoped closure package and its scope dir entry", () => {
		expect(keepInPackage("/node_modules/@leichtgewicht")).toBe(true);
		expect(keepInPackage("/node_modules/@leichtgewicht/ip-codec/index.js")).toBe(true);
	});

	it("drops dev dependencies", () => {
		expect(keepInPackage("/node_modules/typescript/lib/tsc.js")).toBe(false);
		expect(keepInPackage("/node_modules/vite/dist/node/index.js")).toBe(false);
	});

	it("drops project source the Vite plugin already bundled", () => {
		expect(keepInPackage("/src/main/main.ts")).toBe(false);
		expect(keepInPackage("/forge.config.ts")).toBe(false);
	});

	it("does not capture a package that merely prefixes a closure member", () => {
		expect(keepInPackage("/node_modules/bonjour-service-extra/index.js")).toBe(false);
	});

	it("exposes the closure for maintenance", () => {
		expect(RUNTIME_DEPS).toContain("bonjour-service");
		expect(RUNTIME_DEPS).toContain("@leichtgewicht/ip-codec");
	});
});
