// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
	it("renders the toolbar, list pane, detail pane, and status bar landmarks", () => {
		const { container } = render(<App />);
		expect(container.querySelector(".bcn-app")).toBeTruthy();
		expect(container.querySelector(".bcn-toolbar")).toBeTruthy();
		expect(container.querySelector(".bcn-list-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-detail-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-status-bar")).toBeTruthy();
		expect(screen.getByText("Beacon")).toBeTruthy();
	});

	it("defaults the staleness attribute to fresh", () => {
		const { container } = render(<App />);
		expect(container.querySelector(".bcn-app")?.getAttribute("data-staleness")).toBe("fresh");
	});
});
