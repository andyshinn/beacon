import { create } from "zustand";
import type { DiscoveryDelta, DiscoverySnapshot, DiscoveryStatus, Host, Instance } from "../../shared/types";

export type SelectionKind = "inst" | "host" | "svc" | "ip";
export interface Selection {
	kind: SelectionKind;
	id: string;
}

interface DiscoveryState {
	hosts: Map<string, Host>;
	instances: Map<string, Instance>;
	status: DiscoveryStatus;
	selection: Selection | null;
	query: string;
	expanded: Set<string>;
	pausedAt: number;
	now: number;
	toast: string | null;
	permissionHint: boolean;
	applySnapshot: (snapshot: DiscoverySnapshot) => void;
	applyDelta: (delta: DiscoveryDelta) => void;
	applyStatus: (status: DiscoveryStatus) => void;
	tick: (now: number) => void;
	selectInst: (id: string) => void;
	selectSvc: (id: string) => void;
	selectHost: (id: string) => void;
	selectIp: (id: string) => void;
	clearSelection: () => void;
	toggleExpand: (id: string) => void;
	expandAll: (ids: string[]) => void;
	collapseAll: () => void;
	setQuery: (q: string) => void;
	clearSearch: () => void;
	showToast: (msg: string) => void;
	dismissToast: () => void;
	showPermissionHint: () => void;
	dismissPermissionHint: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useDiscoveryStore = create<DiscoveryState>((set) => ({
	hosts: new Map(),
	instances: new Map(),
	status: { live: false, scanning: false },
	selection: null,
	query: "",
	expanded: new Set(),
	pausedAt: 0,
	now: 0,
	toast: null,
	permissionHint: false,

	applySnapshot: (snapshot) =>
		set(() => ({
			hosts: new Map(snapshot.hosts.map((h) => [h.id, h])),
			instances: new Map(snapshot.instances.map((i) => [i.key, i])),
		})),

	applyDelta: (delta) =>
		set((s) => {
			const hosts = new Map(s.hosts);
			const instances = new Map(s.instances);
			for (const h of delta.upsertHosts ?? []) hosts.set(h.id, h);
			for (const id of delta.removeHostIds ?? []) hosts.delete(id);
			for (const i of delta.upsertInstances ?? []) instances.set(i.key, i);
			for (const k of delta.removeInstanceKeys ?? []) instances.delete(k);
			return { hosts, instances };
		}),

	applyStatus: (status) =>
		set((s) => {
			// pausedAt: 0 is the "never paused" sentinel; on entering pause we stamp it with the
			// current clock (s.now), and clear it to 0 on resume. Consumers (LiveToggle/StatusBar/App)
			// treat pausedAt === 0 as age 0 to avoid a boot-time "stale" flash before the first
			// onStatus(live:true) arrives — do not remove that guard or this stamping.
			let pausedAt = s.pausedAt;
			if (status.live) pausedAt = 0;
			else if (pausedAt === 0) pausedAt = s.now;
			return { status, pausedAt };
		}),

	tick: (now) => set({ now }),

	selectInst: (id) => set({ selection: { kind: "inst", id } }),
	selectSvc: (id) => set((s) => ({ selection: { kind: "svc", id }, expanded: new Set(s.expanded).add(`svc:${id}`) })),
	selectHost: (id) => set((s) => ({ selection: { kind: "host", id }, expanded: new Set(s.expanded).add(`host:${id}`) })),
	selectIp: (id) => set({ selection: { kind: "ip", id } }),
	clearSelection: () => set({ selection: null }),

	toggleExpand: (id) =>
		set((s) => {
			const next = new Set(s.expanded);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return { expanded: next };
		}),
	expandAll: (ids) => set({ expanded: new Set(ids) }),
	collapseAll: () => set({ expanded: new Set() }),

	setQuery: (q) => set({ query: q }),
	clearSearch: () => set({ query: "" }),

	showToast: (msg) => {
		set({ toast: msg });
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => set({ toast: null }), 1900);
	},
	dismissToast: () => {
		if (toastTimer) clearTimeout(toastTimer);
		set({ toast: null });
	},

	showPermissionHint: () => set({ permissionHint: true }),
	dismissPermissionHint: () => set({ permissionHint: false }),
}));
