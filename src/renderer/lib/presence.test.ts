import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { addrAllowed, cmpIp, isLeft, isNew, primaryIp, relativeLastSeen, trunc } from "./presence";

function host(addrs: Host["addresses"]): Host {
  return { id: "h", displayName: "H", hostname: "H.local.", addresses: addrs, firstSeen: 0, lastSeen: 0, present: true };
}
function inst(over: Partial<Instance>): Instance {
  return {
    key: "k",
    name: "n",
    serviceType: "_x._tcp",
    protocol: "tcp",
    port: 0,
    txt: {},
    hostId: "h",
    firstSeen: 0,
    lastSeen: 0,
    present: true,
    ...over,
  };
}

describe("primaryIp", () => {
  it("prefers ipv4 over other families and drops zone", () => {
    expect(
      primaryIp(
        host([
          { value: "fe80::1", family: "linklocal", zone: "en0" },
          { value: "10.0.0.2", family: "ipv4" },
        ]),
      ),
    ).toBe("10.0.0.2");
  });
  it("returns null for no addresses", () => {
    expect(primaryIp(host([]))).toBeNull();
    expect(primaryIp(undefined)).toBeNull();
  });
});

describe("isNew / isLeft", () => {
  it("isNew is true only while present and within the NEW window", () => {
    expect(isNew(inst({ firstSeen: 1000 }), 3000)).toBe(true);
    expect(isNew(inst({ firstSeen: 1000 }), 9000)).toBe(false);
    expect(isNew(inst({ firstSeen: 1000, present: false }), 3000)).toBe(false);
  });
  it("isLeft tracks absence", () => {
    expect(isLeft(inst({ present: false }))).toBe(true);
    expect(isLeft(inst({ present: true }))).toBe(false);
  });
});

describe("cmpIp", () => {
  it("orders dotted-quad numerically, nulls last", () => {
    expect(cmpIp("10.0.0.2", "10.0.0.10")).toBeLessThan(0);
    expect(cmpIp(null, "10.0.0.1")).toBeGreaterThan(0);
    expect(cmpIp("a::1", "b::1")).toBeLessThan(0);
  });
});

describe("trunc / relativeLastSeen / addrAllowed", () => {
  it("truncates long labels at 44 chars", () => {
    expect(trunc("x".repeat(50))).toBe(`${"x".repeat(42)}…`);
    expect(trunc("short")).toBe("short");
  });
  it("formats last seen relative to now", () => {
    expect(relativeLastSeen(0, 0, true)).toBe("just now");
    expect(relativeLastSeen(1000, 5000, false)).toBe("4s ago");
  });
  it("gates families by show-toggles", () => {
    expect(addrAllowed("ipv4", { showV6: false, showLinkLocal: false })).toBe(true);
    expect(addrAllowed("loopback", { showV6: false, showLinkLocal: false })).toBe(true);
    expect(addrAllowed("ipv6", { showV6: false, showLinkLocal: true })).toBe(false);
    expect(addrAllowed("linklocal", { showV6: true, showLinkLocal: false })).toBe(false);
  });
});
