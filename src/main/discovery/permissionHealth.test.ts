import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalNetworkHealthCheck } from "./permissionHealth";

describe("LocalNetworkHealthCheck", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("warns once after the timeout when no activity arrives", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
    check.arm(warn);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(warn).toHaveBeenCalledTimes(1); // latched
  });

  it("does not warn when activity arrives before the timeout", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
    check.arm(warn);
    vi.advanceTimersByTime(3000);
    check.noteActivity();
    vi.advanceTimersByTime(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("never warns again once activity has been seen", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
    check.noteActivity();
    check.arm(warn);
    vi.advanceTimersByTime(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("cancel() clears a pending warning", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
    check.arm(warn);
    check.cancel();
    vi.advanceTimersByTime(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does nothing when disabled (non-darwin)", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: false, timeoutMs: 5000 });
    check.arm(warn);
    vi.advanceTimersByTime(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not start a second timer if armed twice", () => {
    const warn = vi.fn();
    const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
    check.arm(warn);
    check.arm(warn);
    vi.advanceTimersByTime(5000);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
