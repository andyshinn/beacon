import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoverySnapshot, Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "./discoveryStore";

function host(id: string): Host {
	return {
		id,
		displayName: id,
		hostname: `${id}.local.`,
		addresses: [{ value: "10.0.0.2", family: "ipv4" }],
		firstSeen: 0,
		lastSeen: 0,
		present: true,
	};
}
function inst(key: string, hostId: string): Instance {
	return {
		key,
		name: key,
		serviceType: "_x._tcp",
		protocol: "tcp",
		port: 0,
		txt: {},
		hostId,
		firstSeen: 0,
		lastSeen: 0,
		present: true,
	};
}
const snap: DiscoverySnapshot = { hosts: [host("h")], instances: [inst("k", "h")] };

beforeEach(() => {
	useDiscoveryStore.setState({
		hosts: new Map(),
		instances: new Map(),
		status: { live: false, scanning: false },
		selection: null,
		query: "",
		expanded: new Set(),
		now: 0,
		toast: null,
		permissionHint: false,
	});
});

describe("data", () => {
	it("applySnapshot replaces the maps", () => {
		useDiscoveryStore.getState().applySnapshot(snap);
		expect(useDiscoveryStore.getState().instances.get("k")?.name).toBe("k");
		expect(useDiscoveryStore.getState().hosts.get("h")?.hostname).toBe("h.local.");
	});
	it("applyDelta upserts and removes", () => {
		useDiscoveryStore.getState().applySnapshot(snap);
		useDiscoveryStore.getState().applyDelta({ removeInstanceKeys: ["k"] });
		expect(useDiscoveryStore.getState().instances.has("k")).toBe(false);
	});
});

describe("applyStatus", () => {
	it("records the latest live state", () => {
		const s = useDiscoveryStore.getState();
		s.applyStatus({ live: false, scanning: false });
		expect(useDiscoveryStore.getState().status.live).toBe(false);
		s.applyStatus({ live: true, scanning: false });
		expect(useDiscoveryStore.getState().status.live).toBe(true);
	});
});

describe("selection + expand", () => {
	it("selectSvc selects and expands the group", () => {
		useDiscoveryStore.getState().selectSvc("_airplay._tcp");
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "svc", id: "_airplay._tcp" });
		expect(useDiscoveryStore.getState().expanded.has("svc:_airplay._tcp")).toBe(true);
	});
	it("toggleExpand flips membership", () => {
		useDiscoveryStore.getState().toggleExpand("host:h");
		expect(useDiscoveryStore.getState().expanded.has("host:h")).toBe(true);
		useDiscoveryStore.getState().toggleExpand("host:h");
		expect(useDiscoveryStore.getState().expanded.has("host:h")).toBe(false);
	});
	it("expandAll/collapseAll replace the set", () => {
		useDiscoveryStore.getState().expandAll(["a", "b"]);
		expect(useDiscoveryStore.getState().expanded.size).toBe(2);
		useDiscoveryStore.getState().collapseAll();
		expect(useDiscoveryStore.getState().expanded.size).toBe(0);
	});
});

describe("search + toast", () => {
	it("setQuery / clearSearch", () => {
		useDiscoveryStore.getState().setQuery("hue");
		expect(useDiscoveryStore.getState().query).toBe("hue");
		useDiscoveryStore.getState().clearSearch();
		expect(useDiscoveryStore.getState().query).toBe("");
	});
	it("showToast sets and auto-dismisses after 1900ms", () => {
		vi.useFakeTimers();
		useDiscoveryStore.getState().showToast("Copied foo");
		expect(useDiscoveryStore.getState().toast).toBe("Copied foo");
		vi.advanceTimersByTime(1900);
		expect(useDiscoveryStore.getState().toast).toBeNull();
		vi.useRealTimers();
	});
});

it("shows and dismisses the permission hint", () => {
	const store = useDiscoveryStore.getState();
	expect(useDiscoveryStore.getState().permissionHint).toBe(false);
	store.showPermissionHint();
	expect(useDiscoveryStore.getState().permissionHint).toBe(true);
	store.dismissPermissionHint();
	expect(useDiscoveryStore.getState().permissionHint).toBe(false);
});
