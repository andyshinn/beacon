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

  describe("keys that belong to the focused control", () => {
    function mount(html: string): HTMLElement {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host);
      return host.querySelector("[data-target]") as HTMLElement;
    }
    function keyOn(el: HTMLElement, init: KeyboardEventInit) {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      el.dispatchEvent(event);
      return event;
    }
    function expectNoShortcut() {
      expect(window.beacon.setLive).not.toHaveBeenCalled();
      expect(window.beacon.rescan).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().mode).toBe("service");
    }

    it("Space on a role=button copy control does not toggle live", () => {
      const off = installKeyboard();
      const copy = mount('<span role="button" tabindex="0" data-target><svg></svg></span>');
      const event = keyOn(copy, { key: " " });
      expect(window.beacon.setLive).not.toHaveBeenCalled();
      // The control's own default must survive: the global handler has no claim on this key.
      expect(event.defaultPrevented).toBe(false);
      off();
    });
    it("Space from a child of a copy control does not toggle live", () => {
      const off = installKeyboard();
      const icon = mount('<span role="button" tabindex="0"><i data-target></i></span>');
      keyOn(icon, { key: " " });
      expect(window.beacon.setLive).not.toHaveBeenCalled();
      off();
    });
    it("ignores keys a control already handled with preventDefault", () => {
      const off = installKeyboard();
      const el = mount('<div tabindex="0" data-target></div>');
      el.addEventListener("keydown", (e) => e.preventDefault());
      for (const k of [" ", "p", "r", "2"]) keyOn(el, { key: k });
      expectNoShortcut();
      off();
    });
    it("Space on the pane divider does not toggle live", () => {
      const off = installKeyboard();
      const divider = mount('<div role="separator" tabindex="0" data-target></div>');
      keyOn(divider, { key: " " });
      expect(window.beacon.setLive).not.toHaveBeenCalled();
      off();
    });
    it.each(["menu", "listbox", "dialog"])("no single-key shortcut fires inside an open %s", (role) => {
      const off = installKeyboard();
      const item = mount(`<div role="${role}" tabindex="-1"><div tabindex="-1" data-target>Item</div></div>`);
      for (const k of [" ", "p", "r", "1", "2", "3", "4", "/"]) keyOn(item, { key: k });
      expectNoShortcut();
      expect(document.activeElement?.id).not.toBe("beacon-search");
      off();
    });
    it("no single-key shortcut fires when the menu container itself is focused", () => {
      const off = installKeyboard();
      const menu = mount('<div role="menu" tabindex="-1" data-target></div>');
      for (const k of ["p", "r", "2"]) keyOn(menu, { key: k });
      expectNoShortcut();
      off();
    });
    it.each([
      ["select", "<select data-target><option>a</option></select>"],
      ["contenteditable", '<div contenteditable="true" data-target></div>'],
      ["textarea", "<textarea data-target></textarea>"],
    ])("treats %s as typing", (_name, html) => {
      const off = installKeyboard();
      const el = mount(html);
      for (const k of [" ", "p", "r", "2", "/"]) keyOn(el, { key: k });
      expectNoShortcut();
      expect(document.activeElement?.id).not.toBe("beacon-search");
      off();
    });
    it("Cmd+K still focuses search from a menu and from a button", () => {
      const off = installKeyboard();
      keyOn(mount('<div role="menu"><div data-target></div></div>'), { key: "k", metaKey: true });
      expect(document.activeElement?.id).toBe("beacon-search");
      (document.activeElement as HTMLElement).blur();
      keyOn(mount("<button data-target></button>"), { key: "k", ctrlKey: true });
      expect(document.activeElement?.id).toBe("beacon-search");
      off();
    });
    it("shortcuts still work with focus on the body", () => {
      const off = installKeyboard();
      key({ key: "p" });
      expect(window.beacon.setLive).toHaveBeenCalledTimes(1);
      key({ key: " " });
      expect(window.beacon.setLive).toHaveBeenCalledTimes(2);
      off();
    });
    it("shortcuts still work with focus on a list row, but Space only activates the row", () => {
      const off = installKeyboard();
      const row = mount('<button type="button" data-target>row</button>');
      keyOn(row, { key: " " });
      expect(window.beacon.setLive).not.toHaveBeenCalled();
      keyOn(row, { key: "p" });
      expect(window.beacon.setLive).toHaveBeenCalledTimes(1);
      keyOn(row, { key: "r" });
      expect(window.beacon.rescan).toHaveBeenCalledTimes(1);
      keyOn(row, { key: "3" });
      expect(useSettingsStore.getState().mode).toBe("ip");
      keyOn(row, { key: "/" });
      expect(document.activeElement?.id).toBe("beacon-search");
      off();
    });
  });
});
