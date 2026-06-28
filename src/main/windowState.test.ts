import type { BrowserWindow, Rectangle } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWindowState, manageWindow, type WindowState, type WindowStateIo } from "./windowState";

function io(over: Partial<WindowStateIo> = {}): WindowStateIo {
	return {
		read: () => null,
		write: () => {},
		isOnScreen: () => true,
		...over,
	};
}

describe("loadWindowState", () => {
	it("returns defaults when no file exists", () => {
		expect(loadWindowState(io())).toEqual({ width: 1100, height: 720, isMaximized: false });
	});
	it("returns defaults on corrupt JSON", () => {
		expect(loadWindowState(io({ read: () => "{not json" }))).toEqual({ width: 1100, height: 720, isMaximized: false });
	});
	it("returns saved on-screen bounds verbatim", () => {
		const raw = JSON.stringify({ width: 900, height: 600, x: 100, y: 80, isMaximized: false });
		expect(loadWindowState(io({ read: () => raw, isOnScreen: () => true }))).toEqual({
			width: 900,
			height: 600,
			x: 100,
			y: 80,
			isMaximized: false,
		});
	});
	it("drops x/y when bounds are off-screen but keeps the size", () => {
		const raw = JSON.stringify({ width: 900, height: 600, x: -5000, y: -5000, isMaximized: false });
		expect(loadWindowState(io({ read: () => raw, isOnScreen: () => false }))).toEqual({
			width: 900,
			height: 600,
			isMaximized: false,
		});
	});
	it("preserves isMaximized and falls back to default size when invalid", () => {
		const raw = JSON.stringify({ width: 0, height: -10, isMaximized: true });
		expect(loadWindowState(io({ read: () => raw }))).toEqual({ width: 1100, height: 720, isMaximized: true });
	});
});

type Handler = (...args: unknown[]) => void;

interface FakeWin {
	win: BrowserWindow;
	fire: (event: string) => void;
}

function fakeWindow(opts: { maximized?: boolean; bounds?: Rectangle; normalBounds?: Rectangle }): FakeWin {
	const handlers = new Map<string, Handler>();
	const bounds = opts.bounds ?? { x: 10, y: 20, width: 800, height: 600 };
	const normalBounds = opts.normalBounds ?? bounds;
	const win = {
		isMaximized: () => opts.maximized === true,
		getBounds: () => bounds,
		getNormalBounds: () => normalBounds,
		on: (event: string, cb: Handler) => {
			handlers.set(event, cb);
		},
	} as unknown as BrowserWindow;
	return {
		win,
		fire: (event: string) => {
			const cb = handlers.get(event);
			if (!cb) throw new Error(`no handler registered for "${event}"`);
			cb();
		},
	};
}

function recordingIo(): { io: WindowStateIo; writes: string[]; parseFirst: () => WindowState } {
	const writes: string[] = [];
	return {
		writes,
		parseFirst: () => {
			const first = writes[0];
			if (first === undefined) throw new Error("no write recorded");
			return JSON.parse(first) as WindowState;
		},
		io: {
			read: () => null,
			write: (data) => {
				writes.push(data);
			},
			isOnScreen: () => true,
		},
	};
}

describe("manageWindow", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounces a resize and writes the window bounds after 300ms", () => {
		const { win, fire } = fakeWindow({ bounds: { x: 5, y: 7, width: 1024, height: 768 } });
		const { io, writes, parseFirst } = recordingIo();
		manageWindow(win, io);

		fire("resize");
		expect(writes).toHaveLength(0); // nothing written before the debounce elapses
		vi.advanceTimersByTime(300);

		expect(writes).toHaveLength(1);
		expect(parseFirst()).toEqual({ x: 5, y: 7, width: 1024, height: 768, isMaximized: false });
	});

	it("flushes the final bounds immediately on close and does not double-write a pending resize", () => {
		const { win, fire } = fakeWindow({ bounds: { x: 1, y: 2, width: 900, height: 700 } });
		const { io, writes, parseFirst } = recordingIo();
		manageWindow(win, io);

		fire("resize"); // schedules a debounced save
		fire("close"); // must cancel the pending timer and write immediately
		expect(writes).toHaveLength(1);

		// Advancing past the debounce window must NOT produce a stale second write.
		vi.advanceTimersByTime(300);
		expect(writes).toHaveLength(1);
		expect(parseFirst()).toEqual({ x: 1, y: 2, width: 900, height: 700, isMaximized: false });
	});

	it("persists the normal (restore) bounds, not the maximized bounds, when maximized", () => {
		const { win, fire } = fakeWindow({
			maximized: true,
			bounds: { x: 0, y: 0, width: 1920, height: 1080 }, // maximized bounds (must NOT be saved)
			normalBounds: { x: 120, y: 80, width: 800, height: 600 }, // restore size (must be saved)
		});
		const { io, writes, parseFirst } = recordingIo();
		manageWindow(win, io);

		fire("close");
		expect(writes).toHaveLength(1);
		expect(parseFirst()).toEqual({ x: 120, y: 80, width: 800, height: 600, isMaximized: true });
	});
});
