import { describe, expect, it } from "vitest";
import { loadWindowState, type WindowStateIo } from "./windowState";

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
