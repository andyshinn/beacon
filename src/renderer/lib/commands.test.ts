import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { copyText, exportAs, rescan, toggleLive } from "./commands";

beforeEach(() => {
	useDiscoveryStore.setState({
		instances: new Map(),
		hosts: new Map(),
		status: { live: true, scanning: false },
		toast: null,
		query: "",
		now: 0,
	});
	window.beacon = {
		setLive: vi.fn().mockResolvedValue(undefined),
		rescan: vi.fn().mockResolvedValue(undefined),
		resolve: vi.fn().mockResolvedValue(undefined),
		openExternal: vi.fn().mockResolvedValue(undefined),
		getSnapshot: vi.fn(),
		onSnapshot: vi.fn(),
		onDelta: vi.fn(),
		onStatus: vi.fn(),
	} as unknown as typeof window.beacon;
});

describe("commands", () => {
	it("toggleLive sends the negated live state", async () => {
		await toggleLive();
		expect(window.beacon.setLive).toHaveBeenCalledWith(false);
	});
	it("rescan invokes beacon.rescan", async () => {
		await rescan();
		expect(window.beacon.rescan).toHaveBeenCalled();
	});
	it("copyText writes to clipboard and toasts", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		await copyText("10.0.0.2", "10.0.0.2");
		expect(writeText).toHaveBeenCalledWith("10.0.0.2");
		expect(useDiscoveryStore.getState().toast).toBe("Copied 10.0.0.2");
	});
	it("exportAs(txt) copies a snapshot and toasts", async () => {
		await exportAs("txt");
		expect(useDiscoveryStore.getState().toast).toBe("Copied snapshot");
	});
});
