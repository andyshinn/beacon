// src/renderer/components/ViewMenu.test.tsx
// Uses defaultOpen to surface Radix DropdownMenu portalled content in happy-dom.
// If happy-dom cannot render portalled content even with defaultOpen, the tests
// fall back to asserting the trigger renders and avoid hollow store-only assertions.
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import { ViewMenu } from "./ViewMenu";

beforeEach(() => {
  useSettingsStore.setState({ sortBy: "name", showDesc: true, showV6: true, showLinkLocal: true });
});

describe("ViewMenu", () => {
  it("renders the view-options trigger button", () => {
    render(
      <Theme>
        <ViewMenu />
      </Theme>,
    );
    expect(screen.getByRole("button", { name: "View options" })).toBeTruthy();
  });

  it("changes sort by clicking IP address item", async () => {
    render(
      <Theme>
        <ViewMenu defaultOpen />
      </Theme>,
    );
    const item = await screen.findByText("IP address");
    fireEvent.click(item);
    expect(useSettingsStore.getState().sortBy).toBe("ip");
  });

  it("toggles showV6 by clicking IPv6 addresses row", async () => {
    render(
      <Theme>
        <ViewMenu defaultOpen />
      </Theme>,
    );
    const row = await screen.findByText("IPv6 addresses");
    fireEvent.click(row);
    expect(useSettingsStore.getState().showV6).toBe(false);
  });
});
