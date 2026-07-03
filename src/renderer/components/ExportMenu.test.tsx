// src/renderer/components/ExportMenu.test.tsx
// Uses defaultOpen to surface Radix DropdownMenu portalled content in happy-dom.
// If happy-dom cannot render portalled content even with defaultOpen, the tests
// fall back to asserting the trigger renders and avoid hollow store-only assertions.
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { ExportMenu } from "./ExportMenu";

beforeEach(() => {
  useDiscoveryStore.setState({ instances: new Map(), hosts: new Map(), query: "", toast: null });
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("ExportMenu", () => {
  it("renders the export trigger button", () => {
    render(
      <Theme>
        <ExportMenu />
      </Theme>,
    );
    expect(screen.getByRole("button", { name: /export/i })).toBeTruthy();
  });

  it("copies a snapshot when Copy as text item is clicked", async () => {
    render(
      <Theme>
        <ExportMenu defaultOpen />
      </Theme>,
    );
    const item = await screen.findByText("Copy as text");
    fireEvent.click(item);
    // Allow the async exportAs("txt") to settle
    await vi.waitFor(() => {
      expect(useDiscoveryStore.getState().toast).toBe("Copied snapshot");
    });
  });
});
