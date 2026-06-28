import { describe, expect, it } from "vitest";
import { makeService } from "./sources/FakeSource";
import { DiscoveryStore } from "./store";

describe("DiscoveryStore.upsert", () => {
	it("creates an instance and its host with classified, deduped addresses", () => {
		const store = new DiscoveryStore();
		const svc = makeService({
			name: "Andy's Mac Studio",
			serviceType: "_airplay._tcp",
			hostname: "Andy-Mac-Studio.local.",
			port: 7000,
			addresses: ["172.16.20.157", "fe80::1%en0", "172.16.20.157"],
		});
		const delta = store.upsert(svc, 1000);

		expect(delta.upsertInstances).toHaveLength(1);
		const inst = delta.upsertInstances![0]!;
		expect(inst.key).toBe("andy's mac studio._airplay._tcp.local.");
		expect(inst.hostId).toBe("andy-mac-studio.local.");
		expect(inst.present).toBe(true);
		expect(inst.firstSeen).toBe(1000);
		expect(inst.lastSeen).toBe(1000);

		const host = delta.upsertHosts![0]!;
		expect(host.id).toBe("andy-mac-studio.local.");
		expect(host.displayName).toBe("Andy-Mac-Studio.local");
		expect(host.addresses).toEqual([
			{ value: "172.16.20.157", family: "ipv4" },
			{ value: "fe80::1", family: "linklocal", zone: "en0" },
		]);
		expect(host.present).toBe(true);
	});

	it("re-sighting bumps lastSeen but keeps firstSeen, and clears departedAt", () => {
		const store = new DiscoveryStore();
		const svc = makeService({
			name: "Porch",
			serviceType: "_http._tcp",
			hostname: "porch.local.",
			addresses: ["172.16.20.170"],
		});
		store.upsert(svc, 1000);
		const delta = store.upsert(svc, 5000);
		const inst = delta.upsertInstances![0]!;
		expect(inst.firstSeen).toBe(1000);
		expect(inst.lastSeen).toBe(5000);
		expect(inst.departedAt).toBeUndefined();
		expect(delta.upsertHosts).toBeDefined();
		const host = delta.upsertHosts![0]!;
		expect(host.firstSeen).toBe(1000);
	});

	it("merges addresses from two instances on the same host (union)", () => {
		const store = new DiscoveryStore();
		store.upsert(
			makeService({ name: "Mac", serviceType: "_airplay._tcp", hostname: "mac.local.", addresses: ["10.0.0.2"] }),
			1000,
		);
		const delta = store.upsert(
			makeService({ name: "Mac", serviceType: "_ssh._tcp", hostname: "mac.local.", addresses: ["10.0.0.3"] }),
			1000,
		);
		const host = delta.upsertHosts![0]!;
		expect(host.addresses.map((a) => a.value).sort()).toEqual(["10.0.0.2", "10.0.0.3"]);
	});

	it("snapshot returns all hosts and instances", () => {
		const store = new DiscoveryStore();
		store.upsert(
			makeService({ name: "Porch", serviceType: "_http._tcp", hostname: "porch.local.", addresses: ["172.16.20.170"] }),
			1000,
		);
		const snap = store.snapshot();
		expect(snap.hosts).toHaveLength(1);
		expect(snap.instances).toHaveLength(1);
	});
});
