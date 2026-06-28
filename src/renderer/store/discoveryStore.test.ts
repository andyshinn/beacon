import { beforeEach, describe, expect, it } from "vitest";
import type { DiscoverySnapshot, Host, Instance } from "../../shared/types";
import { selectRows, useDiscoveryStore } from "./discoveryStore";

function host(id: string, ips: Array<[string, Host["addresses"][number]["family"]]>): Host {
	return {
		id,
		displayName: id,
		hostname: id,
		addresses: ips.map(([value, family]) => ({ value, family })),
		firstSeen: 1,
		lastSeen: 1,
		present: true,
	};
}
function inst(key: string, name: string, serviceType: string, hostId: string): Instance {
	return {
		key,
		name,
		serviceType,
		protocol: "tcp",
		port: 80,
		txt: {},
		hostId,
		firstSeen: 1,
		lastSeen: 1,
		present: true,
	};
}

beforeEach(() => {
	useDiscoveryStore.setState({ hosts: new Map(), instances: new Map(), rows: [] });
});

describe("discoveryStore", () => {
	it("applySnapshot replaces state and derives rows with ipv4-preferred primaryIp", () => {
		const snap: DiscoverySnapshot = {
			hosts: [
				host("h1.local.", [
					["fe80::1", "linklocal"],
					["10.0.0.5", "ipv4"],
				]),
			],
			instances: [inst("a._http._tcp.local.", "Alpha", "_http._tcp", "h1.local.")],
		};
		useDiscoveryStore.getState().applySnapshot(snap);
		const rows = selectRows(useDiscoveryStore.getState());
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			name: "Alpha",
			serviceType: "_http._tcp",
			primaryIp: "10.0.0.5",
		});
	});

	it("applyDelta upserts then removes hosts and instances", () => {
		const s = useDiscoveryStore.getState();
		s.applyDelta({
			upsertHosts: [host("h1.local.", [["10.0.0.5", "ipv4"]])],
			upsertInstances: [inst("a._http._tcp.local.", "Alpha", "_http._tcp", "h1.local.")],
		});
		expect(selectRows(useDiscoveryStore.getState())).toHaveLength(1);
		s.applyDelta({
			removeInstanceKeys: ["a._http._tcp.local."],
			removeHostIds: ["h1.local."],
		});
		expect(selectRows(useDiscoveryStore.getState())).toHaveLength(0);
	});

	it("primaryIp is null when the instance host is unknown or addressless", () => {
		useDiscoveryStore.getState().applyDelta({
			upsertInstances: [inst("a._http._tcp.local.", "Alpha", "_http._tcp", "missing.local.")],
		});
		expect(selectRows(useDiscoveryStore.getState())[0]?.primaryIp).toBeNull();
	});
});
