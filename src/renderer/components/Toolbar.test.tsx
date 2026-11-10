import { Theme } from "@radix-ui/themes";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  useDiscoveryStore.setState({ query: "", status: { live: true, scanning: false }, connected: true });
});

describe("Toolbar", () => {
  it("shows the Beacon brand lockup", () => {
    renderToolbar();
    expect(screen.getByRole("img", { name: "Beacon" })).toBeTruthy();
  });
  it("puts the live toggle first and the lockup between the two control groups", () => {
    const { container } = renderToolbar();
    const lockup = screen.getByRole("img", { name: "Beacon" });
    const [leading, trailing] = [lockup.previousElementSibling, lockup.nextElementSibling];
    expect(leading?.firstElementChild?.textContent).toContain("Live");
    expect(leading?.contains(screen.getAllByText("Hosts")[0] ?? null)).toBe(true);
    expect(trailing?.contains(screen.getByPlaceholderText("Search"))).toBe(true);
    expect(container.contains(lockup)).toBe(true);
  });
  it("switches lens when a segment is clicked", () => {
    renderToolbar();
    // Radix SegmentedControl renders two label spans per item; click the first.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.click(screen.getAllByText("Hosts")[0]!);
    expect(useSettingsStore.getState().mode).toBe("host");
  });
  it("updates the query as the search field changes", () => {
    renderToolbar();
    fireEvent.change(screen.getByPlaceholderText("Search"), { target: { value: "hue" } });
    expect(useDiscoveryStore.getState().query).toBe("hue");
  });
  it("rescans on the rescan button", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Rescan network" }));
    expect(window.beacon.rescan).toHaveBeenCalled();
  });
  it("labels the appearance button with the current theme", () => {
    renderToolbar();
    const dark = screen.getByRole("button", { name: "Appearance: Dark" });
    expect(dark.getAttribute("data-appearance")).toBe("dark");
    cleanup();
    useSettingsStore.setState({ appearance: "light" });
    renderToolbar();
    const light = screen.getByRole("button", { name: "Appearance: Light" });
    expect(light.getAttribute("data-appearance")).toBe("light");
  });
  it("clears the query when the clear button is clicked", () => {
    useDiscoveryStore.setState({ query: "hue", status: { live: true, scanning: false }, connected: true });
    renderToolbar();
    const clear = screen.getByRole("button", { name: "Clear search" });
    // Must stay out of the title-bar drag region, or the OS swallows the click as a window drag.
    expect(clear.className).toContain("bcn-no-drag");
    fireEvent.click(clear);
    expect(useDiscoveryStore.getState().query).toBe("");
  });
});
