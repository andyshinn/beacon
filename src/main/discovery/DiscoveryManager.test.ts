import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoveryManager, type ManagerEvent } from "./DiscoveryManager";
import { FakeSource, makeService } from "./sources/FakeSource";

function collector() {
  const events: ManagerEvent[] = [];
  return { events, onEvent: (e: ManagerEvent) => events.push(e) };
}

function fakeHealth() {
  let warn: (() => void) | undefined;
  return {
    armed: 0,
    noted: 0,
    cancelled: 0,
    arm(onWarn: () => void) {
      this.armed++;
      warn = onWarn;
    },
    noteActivity() {
      this.noted++;
    },
    cancel() {
      this.cancelled++;
    },
    triggerWarn() {
      warn?.();
    },
  };
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

  it("arms the health check on start and notes activity on an up event", () => {
    const source = new FakeSource();
    const { onEvent } = collector();
    const health = fakeHealth();
    new DiscoveryManager({ source, onEvent, healthCheck: health }).start();
    expect(health.armed).toBe(1);
    source.emit({
      type: "up",
      service: makeService({
        name: "Porch",
        serviceType: "_http._tcp",
        hostname: "porch.local.",
        addresses: ["172.16.20.170"],
      }),
    });
    expect(health.noted).toBeGreaterThanOrEqual(1);
  });

  it("emits a health event when the health check warns", () => {
    const source = new FakeSource();
    const { events, onEvent } = collector();
    const health = fakeHealth();
    new DiscoveryManager({ source, onEvent, healthCheck: health }).start();
    health.triggerWarn();
    expect(events).toContainEqual({ type: "health", health: { warning: "local-network" } });
  });

  it("cancels the health check when paused", () => {
    const source = new FakeSource();
    const { onEvent } = collector();
    const health = fakeHealth();
    const manager = new DiscoveryManager({ source, onEvent, healthCheck: health });
    manager.start();
    manager.setLive(false);
    expect(health.cancelled).toBeGreaterThanOrEqual(1);
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

  it("getStatus reflects the current live state for reload resync", () => {
    const source = new FakeSource();
    const { onEvent } = collector();
    const mgr = new DiscoveryManager({ source, onEvent });
    expect(mgr.getStatus()).toEqual({ live: false, scanning: false });
    mgr.start();
    expect(mgr.getStatus()).toEqual({ live: true, scanning: false });
    mgr.setLive(false);
    expect(mgr.getStatus()).toEqual({ live: false, scanning: false });
  });

  it("restartSource stops then restarts the source while live, with a scanning blip", () => {
    const source = new FakeSource();
    const { events, onEvent } = collector();
    const mgr = new DiscoveryManager({ source, onEvent, scanWindowMs: 1200 });
    mgr.start();
    expect(source.startCalls).toBe(1);

    mgr.restartSource();

    expect(source.stopCalls).toBe(1);
    expect(source.startCalls).toBe(2);
    expect(source.started).toBe(true);
    expect(events).toContainEqual({ type: "status", status: { live: true, scanning: true } });
    vi.advanceTimersByTime(1200);
    expect(events).toContainEqual({ type: "status", status: { live: true, scanning: false } });
  });

  it("restartSource is a no-op when paused", () => {
    const source = new FakeSource();
    const { onEvent } = collector();
    const mgr = new DiscoveryManager({ source, onEvent });
    mgr.start();
    mgr.setLive(false);
    const stops = source.stopCalls;
    const starts = source.startCalls;

    mgr.restartSource();

    expect(source.stopCalls).toBe(stops);
    expect(source.startCalls).toBe(starts);
  });

  describe("reconciling after a source restart", () => {
    const porch = makeService({ name: "Porch", serviceType: "_http._tcp", hostname: "porch.local." });
    const den = makeService({ name: "Den", serviceType: "_http._tcp", hostname: "den.local." });

    function setup() {
      const source = new FakeSource();
      const { events, onEvent } = collector();
      const mgr = new DiscoveryManager({
        source,
        onEvent,
        expireIntervalMs: 1000,
        pruneGraceMs: 30_000,
        reannounceWindowMs: 5000,
      });
      mgr.start();
      source.emit({ type: "up", service: porch });
      source.emit({ type: "up", service: den });
      const instance = (key: string) => mgr.getSnapshot().instances.find((i) => i.key === key);
      const host = (id: string) => mgr.getSnapshot().hosts.find((h) => h.id === id);
      return { source, events, mgr, instance, host };
    }

    const restarts: Array<[string, (mgr: DiscoveryManager) => void]> = [
      [
        "pause/resume",
        (mgr) => {
          mgr.setLive(false);
          vi.advanceTimersByTime(60_000);
          mgr.setLive(true);
        },
      ],
      ["restartSource", (mgr) => mgr.restartSource()],
    ];

    describe.each(restarts)("%s", (_name, restart) => {
      it("marks an instance that is not re-announced down after the window, then prunes it", () => {
        const { source, events, mgr, instance, host } = setup();
        const firstSeen = instance(den.key)!.firstSeen;
        restart(mgr);
        const seenBefore = events.length;

        vi.advanceTimersByTime(1000);
        source.emit({ type: "up", service: den });
        vi.advanceTimersByTime(3999);
        expect(instance(porch.key)!.present).toBe(true);

        vi.advanceTimersByTime(1);
        const downAt = Date.now();
        expect(instance(porch.key)).toMatchObject({ present: false, departedAt: downAt });
        expect(host(instance(porch.key)!.hostId)).toMatchObject({ present: false, departedAt: downAt });
        // The renderer hears about it as an ordinary delta.
        const deltas = events.slice(seenBefore).filter((e) => e.type === "delta");
        expect(deltas.at(-1)).toMatchObject({
          delta: { upsertInstances: [{ key: porch.key, present: false }], upsertHosts: [{ present: false }] },
        });

        expect(instance(den.key)).toMatchObject({ present: true, firstSeen });

        vi.advanceTimersByTime(29_000);
        expect(instance(porch.key)).toBeDefined();
        vi.advanceTimersByTime(1000);
        expect(instance(porch.key)).toBeUndefined();
        expect(mgr.getSnapshot().hosts.map((h) => h.id)).toEqual([instance(den.key)!.hostId]);
        expect(instance(den.key)).toMatchObject({ present: true, firstSeen });
      });

      it("re-queries the source part-way through the window", () => {
        const { source, mgr } = setup();
        restart(mgr);
        const before = source.updateCalls;
        vi.advanceTimersByTime(2500);
        expect(source.updateCalls).toBe(before + 1);
      });
    });

    it("marks nothing down while paused, even if paused mid-window", () => {
      const { events, mgr, instance } = setup();
      mgr.restartSource();
      vi.advanceTimersByTime(1000);
      mgr.setLive(false);
      const seenBefore = events.length;

      vi.advanceTimersByTime(120_000);

      expect(instance(porch.key)!.present).toBe(true);
      expect(instance(den.key)!.present).toBe(true);
      expect(events.slice(seenBefore).some((e) => e.type === "delta")).toBe(false);
    });

    it("restarts the window when the source restarts again mid-window", () => {
      const { source, mgr, instance } = setup();
      mgr.restartSource();
      vi.advanceTimersByTime(1000);
      // Confirmed against the first browser only; the second one starts empty again.
      source.emit({ type: "up", service: den });
      vi.advanceTimersByTime(3000);
      mgr.restartSource();

      vi.advanceTimersByTime(4999);
      expect(instance(porch.key)!.present).toBe(true);
      vi.advanceTimersByTime(1);
      expect(instance(porch.key)!.present).toBe(false);
      expect(instance(den.key)!.present).toBe(false);
    });

    it("keeps the departure time of an instance that goes down during the window", () => {
      const { source, mgr, instance } = setup();
      mgr.restartSource();
      vi.advanceTimersByTime(1000);
      source.emit({ type: "up", service: porch });
      source.emit({ type: "down", key: porch.key });
      const departedAt = instance(porch.key)!.departedAt;

      vi.advanceTimersByTime(4000);
      expect(instance(porch.key)!.departedAt).toBe(departedAt);
    });

    it("does not mark anything down after stop()", () => {
      const { mgr, instance } = setup();
      mgr.restartSource();
      mgr.stop();
      vi.advanceTimersByTime(10_000);
      expect(instance(porch.key)!.present).toBe(true);
    });
  });
});
