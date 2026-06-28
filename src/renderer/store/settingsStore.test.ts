// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
	localStorage.clear();
	useSettingsStore.setState({
		appearance: "dark",
		mode: "service",
		sortBy: "name",
		showDesc: true,
		showV6: true,
		showLinkLocal: true,
	});
});

describe("settingsStore", () => {
	it("defaults to dark / service / name and all show-toggles on", () => {
		const s = useSettingsStore.getState();
		expect(s.appearance).toBe("dark");
		expect(s.mode).toBe("service");
		expect(s.sortBy).toBe("name");
		expect([s.showDesc, s.showV6, s.showLinkLocal]).toEqual([true, true, true]);
	});
	it("toggleAppearance flips dark/light", () => {
		useSettingsStore.getState().toggleAppearance();
		expect(useSettingsStore.getState().appearance).toBe("light");
	});
	it("setMode / toggleShowV6 mutate", () => {
		useSettingsStore.getState().setMode("ip");
		useSettingsStore.getState().toggleShowV6();
		expect(useSettingsStore.getState().mode).toBe("ip");
		expect(useSettingsStore.getState().showV6).toBe(false);
	});
});
