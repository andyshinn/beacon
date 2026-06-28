import { create } from "zustand";
import type { DiscoveryDelta, DiscoverySnapshot, Host, Instance } from "../../shared/types";

export interface InstanceRow {
	key: string;
	name: string;
	serviceType: string;
	primaryIp: string | null;
}

interface DiscoveryState {
	hosts: Map<string, Host>;
	instances: Map<string, Instance>;
	rows: InstanceRow[];
	applySnapshot: (snapshot: DiscoverySnapshot) => void;
	applyDelta: (delta: DiscoveryDelta) => void;
}

const FAMILY_ORDER = { ipv4: 0, ipv6: 1, linklocal: 2, loopback: 3 } as const;

function primaryIp(host: Host | undefined): string | null {
	if (!host || host.addresses.length === 0) return null;
	const best = [...host.addresses].sort((a, b) => FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family])[0];
	return best ? best.value : null;
}

function buildRows(hosts: Map<string, Host>, instances: Map<string, Instance>): InstanceRow[] {
	return [...instances.values()]
		.map((i) => ({
			key: i.key,
			name: i.name,
			serviceType: i.serviceType,
			primaryIp: primaryIp(hosts.get(i.hostId)),
		}))
		.sort((a, b) => a.name.localeCompare(b.name) || a.serviceType.localeCompare(b.serviceType));
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
	hosts: new Map(),
	instances: new Map(),
	rows: [],
	applySnapshot: (snapshot) => {
		const hosts = new Map(snapshot.hosts.map((h) => [h.id, h] as const));
		const instances = new Map(snapshot.instances.map((i) => [i.key, i] as const));
		set({ hosts, instances, rows: buildRows(hosts, instances) });
	},
	applyDelta: (delta) => {
		const hosts = new Map(get().hosts);
		const instances = new Map(get().instances);
		for (const h of delta.upsertHosts ?? []) hosts.set(h.id, h);
		for (const id of delta.removeHostIds ?? []) hosts.delete(id);
		for (const i of delta.upsertInstances ?? []) instances.set(i.key, i);
		for (const k of delta.removeInstanceKeys ?? []) instances.delete(k);
		set({ hosts, instances, rows: buildRows(hosts, instances) });
	},
}));

export const selectRows = (s: DiscoveryState): InstanceRow[] => s.rows;
