import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { toCSV, toJSON, toText } from "./export";

const hosts = new Map<string, Host>([
  [
    "h",
    {
      id: "h",
      displayName: "Mac",
      hostname: "Mac.local.",
      addresses: [{ value: "10.0.0.2", family: "ipv4" }],
      firstSeen: 0,
      lastSeen: 0,
      present: true,
    },
  ],
]);
const instances: Instance[] = [
  {
    key: "k",
    name: "Mac",
    serviceType: "_ssh._tcp",
    protocol: "tcp",
    port: 22,
    txt: { a: "b" },
    hostId: "h",
    firstSeen: 0,
    lastSeen: 0,
    present: true,
  },
];

describe("export formatters", () => {
  it("toJSON emits one record per instance with host fields", () => {
    const rows = JSON.parse(toJSON(instances, hosts));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Mac",
      serviceType: "_ssh._tcp",
      port: 22,
      hostname: "Mac.local.",
      primaryIp: "10.0.0.2",
      present: true,
    });
    expect(rows[0].txt).toEqual({ a: "b" });
  });
  it("toCSV has a header row and quotes fields", () => {
    const lines = toCSV(instances, hosts).split("\n");
    expect(lines[0]).toBe("name,serviceType,protocol,port,host,hostname,primaryIp,addresses,present,txt");
    expect(lines[1]).toContain('"Mac"');
    expect(lines[1]).toContain('"_ssh._tcp"');
    expect(lines[1]).toContain('"a=b"');
  });
  it("toText lists name, type, and endpoint", () => {
    expect(toText(instances, hosts)).toContain("Mac  _ssh._tcp  10.0.0.2:22");
  });
});
