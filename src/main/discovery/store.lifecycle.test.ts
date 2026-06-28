import { describe, expect, it } from "vitest";
import { makeService } from "./sources/FakeSource";
import { DiscoveryStore } from "./store";

function seed(store: DiscoveryStore, now = 1000) {
	store.upsert(
		makeService({ name: "Mac", serviceType: "_airplay._tcp", hostname: "mac.local.", addresses: ["10.0.0.2"] }),
		now,
	);
	store.upsert(makeService({ name: "Mac", serviceType: "_ssh._tcp", hostname: "mac.local.", addresses: ["10.0.0.2"] }), now);
}

describe("DiscoveryStore.markDown", () => {
	it("marks an instance absent but keeps the host present while a sibling remains", () => {
		const store = new DiscoveryStore();
		seed(store);
		const delta = store.markDown("mac._airplay._tcp.local.", 2000);
		const inst = delta.upsertInstances![0]!;
		expect(inst.present).toBe(false);
		expect(inst.departedAt).toBe(2000);
		expect(delta.upsertHosts![0]!.present).toBe(true); // _ssh sibling still up
	});

	it("flips the host absent when its last instance departs", () => {
		const store = new DiscoveryStore();
		seed(store);
		store.markDown("mac._airplay._tcp.local.", 2000);
		const delta = store.markDown("mac._ssh._tcp.local.", 2500);
		const host = delta.upsertHosts![0]!;
		expect(host.present).toBe(false);
		expect(host.departedAt).toBe(2500);
	});

	it("returns an empty delta for an unknown key", () => {
		const store = new DiscoveryStore();
		expect(store.markDown("nope._http._tcp.local.", 2000)).toEqual({});
	});
});

describe("DiscoveryStore.prune", () => {
	it("does not remove a departed instance before the grace window", () => {
		const store = new DiscoveryStore();
		seed(store);
		store.markDown("mac._airplay._tcp.local.", 2000);
		const delta = store.prune(2000 + 29_999, 30_000);
		expect(delta).toEqual({});
	});

	it("removes a departed instance after the grace window", () => {
		const store = new DiscoveryStore();
		seed(store);
		store.markDown("mac._airplay._tcp.local.", 2000);
		const delta = store.prune(2000 + 30_000, 30_000);
		expect(delta.removeInstanceKeys).toEqual(["mac._airplay._tcp.local."]);
		expect(delta.removeHostIds).toBeUndefined(); // host still has _ssh
	});

	it("removes the host once its last instance is pruned", () => {
		const store = new DiscoveryStore();
		seed(store);
		store.markDown("mac._airplay._tcp.local.", 2000);
		store.markDown("mac._ssh._tcp.local.", 2000);
		const delta = store.prune(2000 + 30_000, 30_000);
		expect(delta.removeInstanceKeys!.sort()).toEqual(["mac._airplay._tcp.local.", "mac._ssh._tcp.local."]);
		expect(delta.removeHostIds).toEqual(["mac.local."]);
		expect(store.snapshot()).toEqual({ hosts: [], instances: [] });
	});
});
