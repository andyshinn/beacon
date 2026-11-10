// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    appearance: "system",
    mode: "service",
    sortBy: "name",
    showDesc: true,
    showV6: true,
    showLinkLocal: true,
    listPaneWidth: 384,
  });
});

describe("settingsStore", () => {
  it("defaults to system / service / name and all show-toggles on", () => {
    const s = useSettingsStore.getState();
    expect(s.appearance).toBe("system");
    expect(s.mode).toBe("service");
    expect(s.sortBy).toBe("name");
    expect([s.showDesc, s.showV6, s.showLinkLocal]).toEqual([true, true, true]);
  });
  it("setAppearance stores the choice", () => {
    useSettingsStore.getState().setAppearance("light");
    expect(useSettingsStore.getState().appearance).toBe("light");
  });
  it.each(["dark", "light"] as const)("keeps a v1 user's saved %s appearance when migrating", async (appearance) => {
    localStorage.setItem("beacon.settings", JSON.stringify({ state: { appearance, mode: "host" }, version: 1 }));
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().appearance).toBe(appearance);
    expect(useSettingsStore.getState().mode).toBe("host");
  });
  it("follows the system when nothing is saved", async () => {
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState().appearance).toBe("system");
  });
  it("setMode / toggleShowV6 mutate", () => {
    useSettingsStore.getState().setMode("ip");
    useSettingsStore.getState().toggleShowV6();
    expect(useSettingsStore.getState().mode).toBe("ip");
    expect(useSettingsStore.getState().showV6).toBe(false);
  });
  it("setListPaneWidth clamps and stores the width", () => {
    useSettingsStore.getState().setListPaneWidth(100);
    expect(useSettingsStore.getState().listPaneWidth).toBe(260);
    useSettingsStore.getState().setListPaneWidth(400);
    expect(useSettingsStore.getState().listPaneWidth).toBe(400);
  });
});
