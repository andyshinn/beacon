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
