import type { DiscoveredService } from "../../../shared/types";
import { makeService } from "./FakeSource";

// A trimmed, realistic set derived from the Beacon prototype data.
export const FIXTURE_SERVICES: DiscoveredService[] = [
  makeService({
    name: "Andy's Mac Studio",
    serviceType: "_airplay._tcp",
    hostname: "Andy-Mac-Studio.local.",
    port: 7000,
    addresses: ["172.16.20.157", "fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6", "fe80::cb3:f675:6b85:c344%en0"],
    txt: { deviceid: "DA:F2:04:CD:40:AB", model: "Mac14,14" },
  }),
  makeService({
    name: "Andy's Mac Studio",
    serviceType: "_ssh._tcp",
    hostname: "Andy-Mac-Studio.local.",
    port: 22,
    addresses: ["172.16.20.157"],
  }),
  makeService({
    name: "Living Room",
    serviceType: "_meshcop._udp",
    hostname: "Living-Room.local.",
    port: 49191,
    addresses: ["172.16.20.51", "fe80::18e4:21ff:fe55:1a2b%en0"],
    txt: { nn: "MyHome", rv: "1" },
  }),
  makeService({
    name: "Kitchen Switch",
    serviceType: "_http._tcp",
    hostname: "Kitchen-Switch.local.",
    port: 80,
    addresses: ["172.16.20.60"],
    txt: { gen: "2", app: "Plus1", ver: "1.7.5" },
  }),
];
