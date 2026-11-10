import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import { AppearanceMenu } from "./AppearanceMenu";

function stubSystem(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function renderMenu(defaultOpen = false) {
  return render(
    <Theme>
      <AppearanceMenu defaultOpen={defaultOpen} />
    </Theme>,
  );
}

beforeEach(() => {
  useSettingsStore.setState({ appearance: "system" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppearanceMenu", () => {
  it("says the OS is choosing, and which theme that resolves to", () => {
    stubSystem(false);
    renderMenu();
    const button = screen.getByRole("button", { name: "Appearance: System (light)" });
    expect(button.getAttribute("data-appearance")).toBe("light");
  });

  it("resolves system to dark on a dark OS", () => {
    stubSystem(true);
    renderMenu();
    const button = screen.getByRole("button", { name: "Appearance: System (dark)" });
    expect(button.getAttribute("data-appearance")).toBe("dark");
  });

  it("an explicit choice wins over the OS", () => {
    stubSystem(true);
    useSettingsStore.setState({ appearance: "light" });
    renderMenu();
    expect(screen.getByRole("button", { name: "Appearance: Light" })).toBeTruthy();
  });

  it("picks an appearance from the menu", async () => {
    stubSystem(false);
    renderMenu(true);
    fireEvent.click(await screen.findByText("Dark"));
    expect(useSettingsStore.getState().appearance).toBe("dark");
  });
});
