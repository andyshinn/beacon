import { describe, expect, it } from "vitest";
import { HOST_WEB_TYPES, INSTANCE_WEB_TYPES, serviceMeta, webScheme, webUrl } from "./serviceTypes";

describe("serviceMeta", () => {
  it("returns metadata for known types", () => {
    expect(serviceMeta("_hap._tcp").desc).toBe("HomeKit Accessory Protocol");
    expect(serviceMeta("_meshcop._udp").proto).toBe("udp");
  });
  it("defaults unknown types to empty desc + tcp", () => {
    expect(serviceMeta("_nope._tcp")).toEqual({ desc: "", proto: "tcp" });
  });
});

describe("web types + url", () => {
  it("uses https only for hue and includes the port", () => {
    expect(webScheme("_hue._tcp")).toBe("https");
    expect(webScheme("_http._tcp")).toBe("http");
    expect(webUrl("_http._tcp", "10.0.0.5", 8080)).toBe("http://10.0.0.5:8080");
    expect(webUrl("_hue._tcp", "10.0.0.5", 0)).toBe("https://10.0.0.5");
    expect(webUrl("_http._tcp", null, 80)).toBeNull();
  });
  it("scopes web sets per detail kind", () => {
    expect(INSTANCE_WEB_TYPES.has("_prusalink._tcp")).toBe(true);
    expect(HOST_WEB_TYPES.has("_prusalink._tcp")).toBe(false);
    expect(HOST_WEB_TYPES.has("_home-assistant._tcp")).toBe(true);
  });
});
