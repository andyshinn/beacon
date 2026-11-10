import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Appearance } from "../shared/ipc";
import {
  type AppearanceIo,
  applyAppearance,
  loadAppearance,
  type NativeThemeLike,
  WINDOW_BACKGROUND,
  windowBackground,
} from "./appearance";

function memoryIo(initial: string | null = null): AppearanceIo & { data: string | null } {
  return {
    data: initial,
    read() {
      return this.data;
    },
    write(data) {
      this.data = data;
    },
  };
}

function theme(themeSource: Appearance = "system", dark = false): NativeThemeLike {
  return { themeSource, shouldUseDarkColors: dark };
}

describe("loadAppearance", () => {
  it("defaults to system when nothing usable is saved", () => {
    expect(loadAppearance(memoryIo())).toBe("system");
    expect(loadAppearance(memoryIo("not json"))).toBe("system");
    expect(loadAppearance(memoryIo('{"appearance":"sepia"}'))).toBe("system");
    expect(loadAppearance(memoryIo("null"))).toBe("system");
  });
  it("returns the saved choice", () => {
    expect(loadAppearance(memoryIo('{"appearance":"light"}'))).toBe("light");
  });
});

describe("applyAppearance", () => {
  it("sets the native theme and persists it for the next launch", () => {
    const io = memoryIo();
    const native = theme();
    expect(applyAppearance("dark", native, io)).toBe(true);
    expect(native.themeSource).toBe("dark");
    expect(loadAppearance(io)).toBe("dark");
  });
  it.each([undefined, null, 1, "sepia", { appearance: "dark" }])("ignores untrusted value %j", (value) => {
    const io = memoryIo();
    const native = theme("light");
    expect(applyAppearance(value, native, io)).toBe(false);
    expect(native.themeSource).toBe("light");
    expect(io.data).toBeNull();
  });
});

describe("windowBackground", () => {
  it("matches the resolved native theme", () => {
    expect(windowBackground(theme("system", true))).toBe(WINDOW_BACKGROUND.dark);
    expect(windowBackground(theme("system", false))).toBe(WINDOW_BACKGROUND.light);
  });
  it("uses the same colors as the renderer's --app-bg tokens", () => {
    const css = readFileSync(new URL("../renderer/styles/tokens.css", import.meta.url), "utf8");
    expect(css).toContain(`--app-bg: ${WINDOW_BACKGROUND.dark};`);
    expect(css).toContain(`--app-bg: ${WINDOW_BACKGROUND.light};`);
  });
});
