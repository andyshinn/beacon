import { describe, expect, it } from "vitest";
import { clampPaneWidth, PANE_DEFAULT, PANE_MAX, PANE_MIN } from "./paneWidth";

describe("clampPaneWidth", () => {
	it("clamps values below the minimum up to PANE_MIN", () => {
		expect(clampPaneWidth(100)).toBe(PANE_MIN);
	});
	it("clamps values above the maximum down to PANE_MAX", () => {
		expect(clampPaneWidth(9999)).toBe(PANE_MAX);
	});
	it("floors fractional in-range values", () => {
		expect(clampPaneWidth(400.7)).toBe(400);
	});
	it("returns the default for non-finite input", () => {
		expect(clampPaneWidth(Number.NaN)).toBe(PANE_DEFAULT);
	});
});
