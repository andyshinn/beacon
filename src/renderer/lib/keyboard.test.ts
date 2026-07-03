// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { installKeyboard } from "./keyboard";

function key(init: KeyboardEventInit) {
  document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

beforeEach(() => {
  document.body.innerHTML = '<input id="beacon-search" />';
  window.beacon = {
    rescan: vi.fn().mockResolvedValue(undefined),
    setLive: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn(),
    openExternal: vi.fn(),
    getSnapshot: vi.fn(),
    onSnapshot: vi.fn(),
    onDelta: vi.fn(),
    onStatus: vi.fn(),
  } as unknown as typeof window.beacon;
  useSettingsStore.setState({ mode: "service" });
  useDiscoveryStore.setState({ status: { live: true, scanning: false }, query: "" });
});

describe("installKeyboard", () => {
  it("number keys switch lenses and 'r' rescans", () => {
    const off = installKeyboard();
    key({ key: "2" });
    expect(useSettingsStore.getState().mode).toBe("host");
    key({ key: "r" });
    expect(window.beacon.rescan).toHaveBeenCalled();
    off();
  });
  it("'/' focuses the search field", () => {
    const off = installKeyboard();
    key({ key: "/" });
    expect(document.activeElement?.id).toBe("beacon-search");
    off();
  });
  it("removes its listener when disposed", () => {
    const off = installKeyboard();
    off();
    key({ key: "r" });
    expect(window.beacon.rescan).not.toHaveBeenCalled();
  });
  it("Cmd+[ goes back and Cmd+] goes forward", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    const off = installKeyboard();
    key({ key: "[", metaKey: true });
    expect(back).toHaveBeenCalledTimes(1);
    key({ key: "]", metaKey: true });
    expect(forward).toHaveBeenCalledTimes(1);
    off();
    back.mockRestore();
    forward.mockRestore();
  });
  it("Cmd+ArrowLeft/ArrowRight navigate history", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    const off = installKeyboard();
    key({ key: "ArrowLeft", metaKey: true });
    key({ key: "ArrowRight", metaKey: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledTimes(1);
    off();
    back.mockRestore();
    forward.mockRestore();
  });
  it("does not navigate history while typing in the search field", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const off = installKeyboard();
    const input = document.getElementById("beacon-search") as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "[", metaKey: true }));
    expect(back).not.toHaveBeenCalled();
    off();
    back.mockRestore();
  });
});
