import { describe, expect, it, vi } from "vitest";
import type { MenuCommand, MenuStatePayload } from "../../shared/ipc";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { dispatchMenuCommand, installMenu, type MenuBridge, type MenuHandlers } from "./menu";

function handlers(): MenuHandlers {
	return {
		rescan: vi.fn(),
		toggleLive: vi.fn(),
		exportAs: vi.fn(),
		setMode: vi.fn(),
		focusSearch: vi.fn(),
		openLocalNetworkSettings: vi.fn(),
	};
}

describe("dispatchMenuCommand", () => {
	it.each([
		["rescan", "rescan"],
		["toggleLive", "toggleLive"],
		["focusSearch", "focusSearch"],
		["openLocalNetworkSettings", "openLocalNetworkSettings"],
	] as const)("routes %s to its handler", (cmd, key) => {
		const h = handlers();
		dispatchMenuCommand(cmd as MenuCommand, h);
		expect(h[key]).toHaveBeenCalledTimes(1);
	});

	it("routes view:* to setMode with the parsed mode", () => {
		const h = handlers();
		dispatchMenuCommand("view:host", h);
		expect(h.setMode).toHaveBeenCalledWith("host");
	});

	it("routes export:* to exportAs with the kind", () => {
		const h = handlers();
		dispatchMenuCommand("export:csv", h);
		expect(h.exportAs).toHaveBeenCalledWith("csv");
	});
});

describe("installMenu", () => {
	function fakeBridge() {
		const sent: MenuStatePayload[] = [];
		let cmd: ((c: MenuCommand) => void) | undefined;
		const bridge: MenuBridge = {
			onMenuCommand: (l) => {
				cmd = l;
				return () => {
					cmd = undefined;
				};
			},
			sendMenuState: (s) => {
				sent.push(s);
			},
		};
		return { bridge, sent, emit: (c: MenuCommand) => cmd?.(c) };
	}

	it("pushes initial state, pushes on live/mode change, and dedupes unrelated changes", () => {
		const { bridge, sent } = fakeBridge();
		useSettingsStore.getState().setMode("service");
		useDiscoveryStore.getState().applyStatus({ live: false, scanning: false });

		const teardown = installMenu(bridge, handlers());
		expect(sent.at(-1)).toEqual({ live: false, mode: "service" });
		const afterInit = sent.length;

		useSettingsStore.getState().setMode("host");
		expect(sent.at(-1)).toEqual({ live: false, mode: "host" });

		useDiscoveryStore.getState().applyStatus({ live: true, scanning: false });
		expect(sent.at(-1)).toEqual({ live: true, mode: "host" });

		const before = sent.length;
		useDiscoveryStore.getState().setQuery("printer"); // no live/mode change
		expect(sent.length).toBe(before);

		expect(afterInit).toBe(1);
		teardown();
	});

	it("dispatches commands received over the bridge", () => {
		const { bridge, emit } = fakeBridge();
		const h = handlers();
		const teardown = installMenu(bridge, h);
		emit("rescan");
		expect(h.rescan).toHaveBeenCalledTimes(1);
		teardown();
	});
});
