import { describe, expect, it, vi } from "vitest";
import { initAutoUpdate } from "./autoUpdate";

describe("initAutoUpdate", () => {
  it("starts the updater when packaged", () => {
    const start = vi.fn();
    const started = initAutoUpdate({ isPackaged: true, start, log: () => {} });
    expect(start).toHaveBeenCalledTimes(1);
    expect(started).toBe(true);
  });

  it("skips the updater when not packaged (dev / electron-forge start)", () => {
    const start = vi.fn();
    const started = initAutoUpdate({ isPackaged: false, start, log: () => {} });
    expect(start).not.toHaveBeenCalled();
    expect(started).toBe(false);
  });
});
