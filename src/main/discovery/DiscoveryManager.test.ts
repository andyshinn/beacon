import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoveryManager, type ManagerEvent } from "./DiscoveryManager";
import { FakeSource, makeService } from "./sources/FakeSource";

function collector() {
	const events: ManagerEvent[] = [];
	return { events, onEvent: (e: ManagerEvent) => events.push(e) };
}

describe("DiscoveryManager", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("emits an initial snapshot and live status on start", () => {
		const source = new FakeSource();
		const { events, onEvent } = collector();
		new DiscoveryManager({ source, onEvent }).start();
		expect(source.started).toBe(true);
		expect(events).toContainEqual({ type: "snapshot", snapshot: { hosts: [], instances: [] } });
		expect(events).toContainEqual({ type: "status", status: { live: true, scanning: false } });
	});

	it("forwards an up event as an upsert delta", () => {
		const source = new FakeSource();
		const { events, onEvent } = collector();
		new DiscoveryManager({ source, onEvent }).start();
		const svc = makeService({
			name: "Porch",
			serviceType: "_http._tcp",
			hostname: "porch.local.",
			addresses: ["172.16.20.170"],
		});
		source.emit({ type: "up", service: svc });
		const delta = events.find((e) => e.type === "delta") as Extract<ManagerEvent, { type: "delta" }>;
		expect(delta.delta.upsertInstances![0]!.key).toBe("porch._http._tcp.local.");
	});

	it("polls source.expire on the interval and prunes after the grace window", () => {
		const source = new FakeSource();
		const { events, onEvent } = collector();
		const mgr = new DiscoveryManager({ source, onEvent, expireIntervalMs: 1000, pruneGraceMs: 30_000 });
		mgr.start();
		const svc = makeService({
			name: "Porch",
			serviceType: "_http._tcp",
			hostname: "porch.local.",
			addresses: ["172.16.20.170"],
		});
		source.emit({ type: "up", service: svc });
		source.emit({ type: "down", key: svc.key });

		vi.advanceTimersByTime(1000);
		expect(source.expireCalls).toBeGreaterThanOrEqual(1);
		// not yet pruned
		expect(events.some((e) => e.type === "delta" && e.delta.removeInstanceKeys)).toBe(false);

		vi.advanceTimersByTime(30_000);
		const removed = events.some((e) => e.type === "delta" && e.delta.removeInstanceKeys?.includes(svc.key));
		expect(removed).toBe(true);
	});

	it("rescan toggles scanning status and re-queries the source", () => {
		const source = new FakeSource();
		const { events, onEvent } = collector();
		const mgr = new DiscoveryManager({ source, onEvent, scanWindowMs: 1200 });
		mgr.start();
		mgr.rescan();
		expect(source.updateCalls).toBe(1);
		expect(events).toContainEqual({ type: "status", status: { live: true, scanning: true } });
		vi.advanceTimersByTime(1200);
		expect(events).toContainEqual({ type: "status", status: { live: true, scanning: false } });
	});

	it("setLive(false) stops the source and interval without clearing the model", () => {
		const source = new FakeSource();
		const { events, onEvent } = collector();
		const mgr = new DiscoveryManager({ source, onEvent, expireIntervalMs: 1000 });
		mgr.start();
		source.emit({
			type: "up",
			service: makeService({
				name: "Porch",
				serviceType: "_http._tcp",
				hostname: "porch.local.",
				addresses: ["172.16.20.170"],
			}),
		});
		mgr.setLive(false);
		expect(source.started).toBe(false);
		expect(events).toContainEqual({ type: "status", status: { live: false, scanning: false } });
		const before = source.expireCalls;
		vi.advanceTimersByTime(5000);
		expect(source.expireCalls).toBe(before); // interval stopped
		expect(mgr.getSnapshot().instances).toHaveLength(1); // model preserved
	});
});
