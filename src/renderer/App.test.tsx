// @vitest-environment happy-dom

import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useDiscoveryStore } from "./store/discoveryStore";
import { useSettingsStore } from "./store/settingsStore";

beforeEach(() => {
	window.beacon = {
		setLive: vi.fn().mockResolvedValue(undefined),
		rescan: vi.fn().mockResolvedValue(undefined),
		resolve: vi.fn(),
		openExternal: vi.fn(),
		getSnapshot: vi.fn(),
		onSnapshot: vi.fn(),
		onDelta: vi.fn(),
		onStatus: vi.fn(),
	} as unknown as typeof window.beacon;
	useSettingsStore.setState({ mode: "service", appearance: "dark" });
	useDiscoveryStore.setState({ query: "", status: { live: true, scanning: false } });
});

function renderApp() {
	return render(
		<Theme appearance="dark" accentColor="indigo" grayColor="slate">
			<App />
		</Theme>,
	);
}

describe("App shell", () => {
	it("renders the toolbar, list pane, detail pane, and status bar landmarks", () => {
		const { container } = renderApp();
		expect(container.querySelector(".bcn-app")).toBeTruthy();
		expect(container.querySelector(".bcn-toolbar")).toBeTruthy();
		expect(container.querySelector(".bcn-list-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-detail-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-status-bar")).toBeTruthy();
		expect(screen.getByRole("img", { name: "Beacon" })).toBeTruthy();
	});

	it("does not mark the app paused while live", () => {
		const { container } = renderApp();
		expect(container.querySelector(".bcn-app")?.getAttribute("data-paused")).toBeNull();
	});

	it("marks the app paused when discovery is paused", () => {
		useDiscoveryStore.setState({ status: { live: false, scanning: false } });
		const { container } = renderApp();
		expect(container.querySelector(".bcn-app")?.getAttribute("data-paused")).toBe("true");
	});
});
