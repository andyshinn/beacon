import { describe, expect, it, vi } from "vitest";
import { installPowerEvents, type PowerMonitorLike } from "./powerEvents";

function fakeMonitor() {
	const handlers: Record<string, Array<() => void>> = {};
	const m: PowerMonitorLike & { emit: (e: string) => void; count: (e: string) => number } = {
		on: (e, cb) => {
			if (!handlers[e]) handlers[e] = [];
			handlers[e].push(cb);
		},
		off: (e, cb) => {
			handlers[e] = (handlers[e] ?? []).filter((h) => h !== cb);
		},
		emit: (e) => {
			for (const h of [...(handlers[e] ?? [])]) h();
		},
		count: (e) => (handlers[e] ?? []).length,
	};
	return m;
}

function fakeClock() {
	let seq = 0;
	const timers = new Map<number, () => void>();
	return {
		setTimer: ((cb: () => void) => {
			const id = ++seq;
			timers.set(id, cb);
			return id as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout,
		clearTimer: ((id: ReturnType<typeof setTimeout>) => {
			timers.delete(id as unknown as number);
		}) as typeof clearTimeout,
		fire: () => {
			for (const [id, cb] of [...timers]) {
				timers.delete(id);
				cb();
			}
		},
		pending: () => timers.size,
	};
}

describe("installPowerEvents", () => {
	it("restarts once after the settle delay when live on resume", () => {
		const monitor = fakeMonitor();
		const clock = fakeClock();
		const restart = vi.fn();
		installPowerEvents({
			powerMonitor: monitor,
			isLive: () => true,
			restart,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});

		monitor.emit("resume");
		expect(restart).not.toHaveBeenCalled(); // waits for settle delay
		clock.fire();
		expect(restart).toHaveBeenCalledTimes(1);
	});

	it("does nothing when paused on resume", () => {
		const monitor = fakeMonitor();
		const clock = fakeClock();
		const restart = vi.fn();
		installPowerEvents({
			powerMonitor: monitor,
			isLive: () => false,
			restart,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});

		monitor.emit("resume");
		expect(clock.pending()).toBe(0);
		clock.fire();
		expect(restart).not.toHaveBeenCalled();
	});

	it("debounces multiple resumes into a single restart", () => {
		const monitor = fakeMonitor();
		const clock = fakeClock();
		const restart = vi.fn();
		installPowerEvents({
			powerMonitor: monitor,
			isLive: () => true,
			restart,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});

		monitor.emit("resume");
		monitor.emit("resume");
		expect(clock.pending()).toBe(1);
		clock.fire();
		expect(restart).toHaveBeenCalledTimes(1);
	});

	it("re-checks live at fire time and skips restart if paused since resume", () => {
		const monitor = fakeMonitor();
		const clock = fakeClock();
		const restart = vi.fn();
		let live = true;
		installPowerEvents({
			powerMonitor: monitor,
			isLive: () => live,
			restart,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});

		monitor.emit("resume");
		live = false; // user pauses during the settle window
		clock.fire();
		expect(restart).not.toHaveBeenCalled();
	});

	it("teardown removes the handler and cancels a pending restart", () => {
		const monitor = fakeMonitor();
		const clock = fakeClock();
		const restart = vi.fn();
		const teardown = installPowerEvents({
			powerMonitor: monitor,
			isLive: () => true,
			restart,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});

		monitor.emit("resume");
		teardown();
		expect(monitor.count("resume")).toBe(0);
		expect(clock.pending()).toBe(0);
		clock.fire();
		expect(restart).not.toHaveBeenCalled();
	});
});
