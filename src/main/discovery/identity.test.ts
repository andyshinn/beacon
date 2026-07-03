import { describe, expect, it } from "vitest";
import { cleanHostname, hostId, instanceKey, parseInstanceName } from "./identity";

describe("identity helpers", () => {
  it("instanceKey lowercases and normalizes the trailing dot", () => {
    expect(instanceKey("Andy's Mac Studio._airplay._tcp.local")).toBe("andy's mac studio._airplay._tcp.local.");
    expect(instanceKey("Andy's Mac Studio._airplay._tcp.local.")).toBe("andy's mac studio._airplay._tcp.local.");
  });
  it("hostId lowercases and normalizes the trailing dot", () => {
    expect(hostId("Andy-Mac-Studio.local")).toBe("andy-mac-studio.local.");
    expect(hostId("Andy-Mac-Studio.local.")).toBe("andy-mac-studio.local.");
  });
  it("cleanHostname strips the trailing dot", () => {
    expect(cleanHostname("Andy-Mac-Studio.local.")).toBe("Andy-Mac-Studio.local");
  });
  it("parseInstanceName splits a full service instance name", () => {
    expect(parseInstanceName("Andy's Mac Studio._airplay._tcp.local.")).toEqual({
      instance: "Andy's Mac Studio",
      serviceType: "_airplay._tcp",
      protocol: "tcp",
      domain: "local.",
    });
  });
  it("parseInstanceName handles udp services", () => {
    expect(parseInstanceName("Living Room._meshcop._udp.local.")).toEqual({
      instance: "Living Room",
      serviceType: "_meshcop._udp",
      protocol: "udp",
      domain: "local.",
    });
  });
  it("parseInstanceName returns null for a non-service name", () => {
    expect(parseInstanceName("just-a-hostname.local.")).toBeNull();
  });
});
