import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { Toolbar } from "./Toolbar";

function renderToolbar() {
	return render(
		<Theme appearance="dark" accentColor="indigo" grayColor="slate">
			<Toolbar />
		</Theme>,
	);
}

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

describe("Toolbar", () => {
	it("switches lens when a segment is clicked", () => {
		renderToolbar();
		// Radix SegmentedControl renders two label spans per item; click the first.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		fireEvent.click(screen.getAllByText("Hosts")[0]!);
		expect(useSettingsStore.getState().mode).toBe("host");
	});
	it("updates the query as the search field changes", () => {
		renderToolbar();
		fireEvent.change(screen.getByPlaceholderText("Search services, hosts, IPs…"), { target: { value: "hue" } });
		expect(useDiscoveryStore.getState().query).toBe("hue");
	});
	it("rescans on the rescan button", () => {
		renderToolbar();
		fireEvent.click(screen.getByRole("button", { name: "Rescan network" }));
		expect(window.beacon.rescan).toHaveBeenCalled();
	});
});
