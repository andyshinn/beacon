import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { buildDetail, type DetailCtx } from "./detail";

const mac: Host = {
	id: "mac",
	displayName: "Mac Studio",
	hostname: "Mac.local.",
	addresses: [
		{ value: "10.0.0.2", family: "ipv4" },
		{ value: "fe80::1", family: "linklocal", zone: "en0" },
	],
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const air: Instance = {
	key: "air",
	name: "Mac Studio",
	serviceType: "_airplay._tcp",
	protocol: "tcp",
	port: 7000,
	txt: { model: "Mac14,14" },
	hostId: "mac",
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const web: Instance = {
	key: "web",
	name: "Mac Studio",
	serviceType: "_http._tcp",
	protocol: "tcp",
	port: 80,
	txt: {},
	hostId: "mac",
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const ctx: DetailCtx = {
	hosts: new Map([["mac", mac]]),
	instances: new Map([
		["air", air],
		["web", web],
	]),
	settings: { showDesc: true, showV6: true, showLinkLocal: true },
	query: "",
	now: 0,
};

describe("buildDetail — null", () => {
	it("returns null for no selection or a miss", () => {
		expect(buildDetail(null, ctx)).toBeNull();
		expect(buildDetail({ kind: "inst", id: "nope" }, ctx)).toBeNull();
	});
});

describe("buildDetail — instance", () => {
	const d = buildDetail({ kind: "inst", id: "air" }, ctx)!;
	it("has a Live status, sub line, and service description", () => {
		expect(d.kind).toBe("instance");
		expect(d.status).toEqual({ live: true, label: "Live" });
		expect(d.sub).toBe("_airplay._tcp  ·  Mac.local.");
		expect(d.serviceDesc).toBe("Protocol for streaming of audio/video content");
	});
	it("omits Open-in-Browser for non-web types but includes Copy Hostname / Resolve / Show Host", () => {
		expect(d.actions.map((a) => a.kind)).toEqual(["copy", "resolve", "reveal"]);
	});
	it("includes an Open action with a built URL for web types", () => {
		const w = buildDetail({ kind: "inst", id: "web" }, ctx)!;
		expect(w.actions[0]).toMatchObject({ kind: "open", primary: true, value: "http://10.0.0.2:80" });
	});
	it("meta has Port only when > 0 and groups addresses with endpoints", () => {
		expect(d.meta.find((m) => m.label === "Port")?.value).toBe("7000");
		expect(d.addrGroups[0]!.addresses[0]).toMatchObject({
			ip: "10.0.0.2",
			endpoint: true,
			portText: ":7000",
			copyValue: "10.0.0.2:7000",
		});
	});
	it("renders TXT rows, or the no-TXT flag when empty", () => {
		expect(d.hasTxt).toBe(true);
		expect(d.txt).toEqual([{ key: "model", value: "Mac14,14" }]);
		expect(buildDetail({ kind: "inst", id: "web" }, ctx)!.noTxt).toBe(true);
	});
});

describe("buildDetail — host", () => {
	const d = buildDetail({ kind: "host", id: "mac" }, ctx)!;
	it("uses Online label and lists advertised services sorted by type", () => {
		expect(d.status).toEqual({ live: true, label: "Online" });
		expect(d.servicesTitle).toBe("Services advertised (2)");
		expect(d.services.map((s) => s.title)).toEqual(["_airplay._tcp", "_http._tcp"]);
	});
});

describe("buildDetail — service type", () => {
	const d = buildDetail({ kind: "svc", id: "_airplay._tcp" }, ctx)!;
	it("shows a mono name, always-on description, and an Advertised-by list", () => {
		expect(d.nameMono).toBe(true);
		expect(d.serviceDesc).toBe("Protocol for streaming of audio/video content");
		expect(d.hostsTitle).toBe("Advertised by");
		expect(d.hosts[0]).toMatchObject({ name: "Mac Studio", sub: "Mac.local.", chip: "10.0.0.2" });
	});
});

describe("buildDetail — ip", () => {
	const d = buildDetail({ kind: "ip", id: "mac|10.0.0.2" }, ctx)!;
	it("shows scope meta and services-on-host", () => {
		expect(d.nameMono).toBe(true);
		expect(d.meta.find((m) => m.label === "Scope")?.value).toBe("Private (RFC 1918)");
		expect(d.servicesTitle).toBe("Services on this host (2)");
	});
});
