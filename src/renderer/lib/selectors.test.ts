// src/renderer/lib/selectors.test.ts
import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import {
	buildFlat,
	buildHostTree,
	buildIpGroups,
	buildServiceTree,
	lensCounts,
	type SelectorCtx,
	visibleInstances,
} from "./selectors";

const mac: Host = {
	id: "mac",
	displayName: "Mac Studio",
	hostname: "Mac.local.",
	addresses: [
		{ value: "10.0.0.2", family: "ipv4" },
		{ value: "fe80::1", family: "linklocal", zone: "en0" },
		{ value: "fdc9::9", family: "ipv6" },
	],
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const hub: Host = {
	id: "hub",
	displayName: "Aqara Hub",
	hostname: "Aqara.local.",
	addresses: [{ value: "10.0.0.9", family: "ipv4" }],
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const hosts = new Map<string, Host>([
	["mac", mac],
	["hub", hub],
]);

function i(over: Partial<Instance> & Pick<Instance, "key" | "serviceType" | "hostId">): Instance {
	return {
		name: over.name ?? over.key,
		protocol: "tcp",
		port: 0,
		txt: {},
		firstSeen: 0,
		lastSeen: 0,
		present: true,
		...over,
	};
}
const insts: Instance[] = [
	i({ key: "a", name: "Mac Studio", serviceType: "_airplay._tcp", hostId: "mac", port: 7000 }),
	i({ key: "b", name: "Mac Studio", serviceType: "_ssh._tcp", hostId: "mac", port: 22 }),
	i({ key: "c", name: "Aqara Hub", serviceType: "_matter._tcp", hostId: "hub", port: 5540, txt: { vp: "abc" } }),
];

function ctx(over: Partial<SelectorCtx> = {}): SelectorCtx {
	return {
		hosts,
		settings: { showDesc: true, showV6: true, showLinkLocal: true, sortBy: "name" },
		query: "",
		expanded: new Set(),
		selection: null,
		now: 0,
		...over,
	};
}

describe("visibleInstances", () => {
	it("returns all when query empty", () => {
		expect(visibleInstances(insts, hosts, "")).toHaveLength(3);
	});
	it("matches name, service type, host fields, address, and txt", () => {
		expect(visibleInstances(insts, hosts, "ssh").map((x) => x.key)).toEqual(["b"]);
		expect(visibleInstances(insts, hosts, "aqara").map((x) => x.key)).toEqual(["c"]);
		expect(visibleInstances(insts, hosts, "10.0.0.9").map((x) => x.key)).toEqual(["c"]);
		expect(visibleInstances(insts, hosts, "vp=abc").map((x) => x.key)).toEqual(["c"]);
	});
});

describe("lensCounts", () => {
	it("counts distinct hosts/services/instances and allowed addresses", () => {
		expect(lensCounts(insts, ctx())).toEqual({ hosts: 2, services: 3, instances: 3, ips: 4 });
		expect(
			lensCounts(insts, ctx({ settings: { showDesc: true, showV6: false, showLinkLocal: false, sortBy: "name" } })).ips,
		).toBe(2);
	});
});

describe("buildServiceTree", () => {
	it("groups by service type (sorted), tags proto + count, gates children on expanded", () => {
		const groups = buildServiceTree(insts, ctx());
		expect(groups.map((g) => g.id)).toEqual(["svc:_airplay._tcp", "svc:_matter._tcp", "svc:_ssh._tcp"]);
		const airplay = groups[0]!;
		expect(airplay.proto).toBe("TCP");
		expect(airplay.count).toBe(1);
		expect(airplay.subtitle).toBe("Protocol for streaming of audio/video content");
		expect(airplay.children).toHaveLength(0); // collapsed
	});
	it("expands a group when in the expanded set; child carries host hostname + primary ip chip + port", () => {
		const groups = buildServiceTree(insts, ctx({ expanded: new Set(["svc:_airplay._tcp"]) }));
		const child = groups[0]!.children[0]!;
		expect(child).toMatchObject({ id: "a", title: "Mac Studio", subtitle: "Mac.local.", chip: "10.0.0.2", port: 7000 });
	});
	it("force-expands every group when search is active", () => {
		const groups = buildServiceTree(insts, ctx({ query: "mac" }));
		expect(groups.every((g) => g.expanded)).toBe(true);
	});
	it("drops the group subtitle when showDesc is off", () => {
		const groups = buildServiceTree(
			insts,
			ctx({ settings: { showDesc: false, showV6: true, showLinkLocal: true, sortBy: "name" } }),
		);
		expect(groups[0]!.subtitle).toBeUndefined();
	});
});

describe("buildHostTree", () => {
	it("groups by host (sorted by display name), gray chip = primary ip, children sorted by service type", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups.map((g) => g.title)).toEqual(["Aqara Hub", "Mac Studio"]);
		const macGroup = groups[1]!;
		expect(macGroup.chip).toBe("10.0.0.2");
		expect(macGroup.children.map((c) => c.title)).toEqual(["_airplay._tcp", "_ssh._tcp"]);
	});
	it("child subtitle appears only when instance name differs from host name", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups[1]!.children[0]!.subtitle).toBeUndefined(); // "Mac Studio" == host display name
	});
});

describe("buildIpGroups", () => {
	it("groups addresses by family in order, with host ports and copy ids", () => {
		const groups = buildIpGroups(insts, ctx());
		expect(groups.map((g) => g.family)).toEqual(["ipv4", "ipv6", "linklocal"]);
		const v4 = groups[0]!;
		expect(v4.label).toBe("IPv4");
		expect(v4.addresses.map((a) => a.ip).sort()).toEqual(["10.0.0.2", "10.0.0.9"]);
		const macRow = v4.addresses.find((a) => a.ip === "10.0.0.2")!;
		expect(macRow.id).toBe("mac|10.0.0.2");
		expect(macRow.ports).toEqual([22, 7000]);
	});
	it("respects show-toggles", () => {
		const groups = buildIpGroups(
			insts,
			ctx({ settings: { showDesc: true, showV6: false, showLinkLocal: false, sortBy: "name" } }),
		);
		expect(groups.map((g) => g.family)).toEqual(["ipv4"]);
	});
});

describe("buildFlat", () => {
	it("sorts by name then service type by default", () => {
		expect(buildFlat(insts, ctx()).map((r) => r.id)).toEqual(["c", "a", "b"]);
	});
	it("sorts by ip when sortBy=ip", () => {
		const rows = buildFlat(insts, ctx({ settings: { showDesc: true, showV6: true, showLinkLocal: true, sortBy: "ip" } }));
		expect(rows[0]!.chip).toBe("10.0.0.2");
	});
});
