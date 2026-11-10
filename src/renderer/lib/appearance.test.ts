import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import { installAppearanceSync, resolveAppearance } from "./appearance";

describe("resolveAppearance", () => {
  it("follows the OS only for system", () => {
    expect(resolveAppearance("system", true)).toBe("dark");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });
});

describe("installAppearanceSync", () => {
  beforeEach(() => {
    useSettingsStore.setState({ appearance: "system" });
  });

  it("sends the current appearance, then each change once", () => {
    const setAppearance = vi.fn();
    const dispose = installAppearanceSync({ setAppearance });
    expect(setAppearance.mock.calls).toEqual([["system"]]);

    useSettingsStore.getState().setMode("host"); // unrelated setting: no resend
    useSettingsStore.getState().setAppearance("dark");
    expect(setAppearance.mock.calls).toEqual([["system"], ["dark"]]);

    dispose();
    useSettingsStore.getState().setAppearance("light");
    expect(setAppearance).toHaveBeenCalledTimes(2);
  });
});
