import { describe, expect, it } from "vitest";
import { classifyAddress } from "./classify";

describe("classifyAddress", () => {
  it("classifies private and public IPv4 as ipv4", () => {
    expect(classifyAddress("172.16.20.157")).toEqual({ value: "172.16.20.157", family: "ipv4" });
  });
  it("classifies IPv4 loopback", () => {
    expect(classifyAddress("127.0.0.1")).toEqual({ value: "127.0.0.1", family: "loopback" });
  });
  it("classifies IPv4 link-local (169.254/16)", () => {
    expect(classifyAddress("169.254.5.9")).toEqual({ value: "169.254.5.9", family: "linklocal" });
  });
  it("classifies global/ULA IPv6 as ipv6", () => {
    expect(classifyAddress("fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6")).toEqual({
      value: "fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6",
      family: "ipv6",
    });
  });
  it("classifies IPv6 loopback ::1", () => {
    expect(classifyAddress("::1")).toEqual({ value: "::1", family: "loopback" });
  });
  it("classifies IPv6 link-local fe80::/10 and keeps the zone", () => {
    expect(classifyAddress("fe80::cb3:f675:6b85:c344%en0")).toEqual({
      value: "fe80::cb3:f675:6b85:c344",
      family: "linklocal",
      zone: "en0",
    });
  });
  it("treats fe80 without a zone as link-local with no zone", () => {
    expect(classifyAddress("fe80::1")).toEqual({ value: "fe80::1", family: "linklocal" });
  });
});
