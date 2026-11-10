import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { PermissionBanner } from "./PermissionBanner";

beforeEach(() => {
  window.beacon = {
    openLocalNetworkSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as typeof window.beacon;
  useDiscoveryStore.setState({ permissionHint: false });
});

// happy-dom can't compute contrast, so pin the token choice instead. Measured in
// Chromium on the amber-a3 fill, light mode: amber-9 is ~1.5:1 and amber-11 is
// 3.8:1; only step 12 clears WCAG AA (4.5:1) in both themes.
describe("PermissionBanner styles", () => {
  it("uses a text-grade amber for the action label", () => {
    const css = readFileSync("src/renderer/components/PermissionBanner.module.css", "utf8");
    const action = /\.action \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(action).toMatch(/[^-]color: var\(--amber-12\)/);
  });
});

describe("PermissionBanner", () => {
  it("renders nothing when there is no hint", () => {
    render(<PermissionBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the hint, opens settings, and dismisses", () => {
    useDiscoveryStore.setState({ permissionHint: true });
    render(<PermissionBanner />);
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.click(screen.getByText("Open Settings"));
    expect(window.beacon.openLocalNetworkSettings).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(useDiscoveryStore.getState().permissionHint).toBe(false);
  });
});
