import type { AddrFamily, Host, Instance } from "../../shared/types";
import type { Selection } from "../store/discoveryStore";
import type { SortBy } from "../store/settingsStore";
import { addrAllowed, cmpIp, isLeft, isNew, primaryIp } from "./presence";
import { serviceMeta } from "./serviceTypes";

export interface ViewSettings {
	showDesc: boolean;
	showV6: boolean;
	showLinkLocal: boolean;
	sortBy: SortBy;
}
export interface SelectorCtx {
	hosts: Map<string, Host>;
	settings: ViewSettings;
	query: string;
	expanded: Set<string>;
	selection: Selection | null;
	now: number;
}

export interface TreeChild {
	id: string;
	title: string;
	subtitle?: string;
	chip: string | null;
	port: number;
	isNew: boolean;
	isLeft: boolean;
	selected: boolean;
}
export interface TreeGroup {
	id: string;
	title: string;
	subtitle?: string;
	count: number;
	proto?: string;
	chip: string | null;
	expanded: boolean;
	selected: boolean;
	children: TreeChild[];
}
export interface IpAddressRow {
	id: string;
	ip: string;
	hostName: string;
	ports: number[];
	selected: boolean;
}
export interface IpGroup {
	family: AddrFamily;
	label: string;
	count: number;
	addresses: IpAddressRow[];
}
export interface FlatRow {
	id: string;
	name: string;
	serviceType: string;
	chip: string | null;
	port: number;
	isNew: boolean;
	isLeft: boolean;
	selected: boolean;
}
export interface LensCounts {
	hosts: number;
	services: number;
	instances: number;
	ips: number;
}

const FAMILY_ORDER: Record<AddrFamily, number> = { ipv4: 0, ipv6: 1, linklocal: 2, loopback: 3 };
const FAMILY_LABEL: Record<AddrFamily, string> = {
	ipv4: "IPv4",
	ipv6: "IPv6",
	linklocal: "Link-local",
	loopback: "Loopback",
};

export function visibleInstances(all: Instance[], hosts: Map<string, Host>, query: string): Instance[] {
	const q = query.trim().toLowerCase();
	if (!q) return all;
	return all.filter((it) => {
		const h = hosts.get(it.hostId);
		if (it.name.toLowerCase().includes(q)) return true;
		if (it.serviceType.toLowerCase().includes(q)) return true;
		if (h?.displayName.toLowerCase().includes(q)) return true;
		if (h?.hostname.toLowerCase().includes(q)) return true;
		if (h?.addresses.some((a) => a.value.toLowerCase().includes(q))) return true;
		for (const [k, v] of Object.entries(it.txt)) if (`${k}=${v}`.toLowerCase().includes(q)) return true;
		return false;
	});
}

export function lensCounts(visible: Instance[], ctx: SelectorCtx): LensCounts {
	const hostIds = new Set(visible.map((i) => i.hostId));
	const serviceTypes = new Set(visible.map((i) => i.serviceType));
	let ips = 0;
	for (const hid of hostIds) {
		const h = ctx.hosts.get(hid);
		if (!h) continue;
		ips += h.addresses.filter((a) => addrAllowed(a.family, ctx.settings)).length;
	}
	return { hosts: hostIds.size, services: serviceTypes.size, instances: visible.length, ips };
}

function searchActive(ctx: SelectorCtx): boolean {
	return ctx.query.trim() !== "";
}

function childOf(
	it: Instance,
	ctx: SelectorCtx,
	opts: { title: string; subtitle?: string; chip: string | null },
): TreeChild {
	return {
		id: it.key,
		title: opts.title,
		subtitle: opts.subtitle,
		chip: opts.chip,
		port: it.port,
		isNew: isNew(it, ctx.now),
		isLeft: isLeft(it),
		selected: ctx.selection?.kind === "inst" && ctx.selection.id === it.key,
	};
}

export function buildServiceTree(visible: Instance[], ctx: SelectorCtx): TreeGroup[] {
	const byType = new Map<string, Instance[]>();
	for (const it of visible) {
		let arr = byType.get(it.serviceType);
		if (!arr) {
			arr = [];
			byType.set(it.serviceType, arr);
		}
		arr.push(it);
	}
	const active = searchActive(ctx);
	return [...byType.keys()].sort().map((t) => {
		const meta = serviceMeta(t);
		const list = byType.get(t) ?? [];
		const expanded = ctx.expanded.has(`svc:${t}`) || active;
		return {
			id: `svc:${t}`,
			title: t,
			subtitle: ctx.settings.showDesc && meta.desc ? meta.desc : undefined,
			count: list.length,
			proto: meta.proto.toUpperCase(),
			chip: null,
			expanded,
			selected: ctx.selection?.kind === "svc" && ctx.selection.id === t,
			children: expanded
				? list.map((it) =>
						childOf(it, ctx, {
							title: it.name,
							subtitle: ctx.hosts.get(it.hostId)?.hostname,
							chip: primaryIp(ctx.hosts.get(it.hostId)),
						}),
					)
				: [],
		};
	});
}

export function buildHostTree(visible: Instance[], ctx: SelectorCtx): TreeGroup[] {
	const byHost = new Map<string, Instance[]>();
	for (const it of visible) {
		let arr = byHost.get(it.hostId);
		if (!arr) {
			arr = [];
			byHost.set(it.hostId, arr);
		}
		arr.push(it);
	}
	const active = searchActive(ctx);
	return [...byHost.keys()]
		.sort((a, b) => (ctx.hosts.get(a)?.displayName ?? a).localeCompare(ctx.hosts.get(b)?.displayName ?? b))
		.map((hid) => {
			const h = ctx.hosts.get(hid);
			const list = [...(byHost.get(hid) ?? [])].sort((a, b) => a.serviceType.localeCompare(b.serviceType));
			const expanded = ctx.expanded.has(`host:${hid}`) || active;
			return {
				id: `host:${hid}`,
				title: h?.displayName ?? hid,
				subtitle: h?.hostname,
				count: list.length,
				chip: primaryIp(h),
				expanded,
				selected: ctx.selection?.kind === "host" && ctx.selection.id === hid,
				children: expanded
					? list.map((it) =>
							childOf(it, ctx, {
								title: it.serviceType,
								subtitle: it.name !== h?.displayName ? it.name : undefined,
								chip: null,
							}),
						)
					: [],
			};
		});
}

export function buildIpGroups(visible: Instance[], ctx: SelectorCtx): IpGroup[] {
	const q = ctx.query.trim().toLowerCase();
	const hostIds: string[] = [];
	for (const it of visible) if (!hostIds.includes(it.hostId)) hostIds.push(it.hostId);

	const groups = new Map<AddrFamily, IpAddressRow[]>();
	for (const hid of hostIds) {
		const h = ctx.hosts.get(hid);
		if (!h) continue;
		const ports = [...new Set(visible.filter((i) => i.hostId === hid && i.port > 0).map((i) => i.port))].sort(
			(a, b) => a - b,
		);
		for (const a of h.addresses) {
			if (!addrAllowed(a.family, ctx.settings)) continue;
			if (
				q &&
				!a.value.toLowerCase().includes(q) &&
				!h.displayName.toLowerCase().includes(q) &&
				!h.hostname.toLowerCase().includes(q)
			)
				continue;
			const id = `${h.id}|${a.value}`;
			const row: IpAddressRow = {
				id,
				ip: a.value,
				hostName: h.displayName,
				ports,
				selected: ctx.selection?.kind === "ip" && ctx.selection.id === id,
			};
			let arr = groups.get(a.family);
			if (!arr) {
				arr = [];
				groups.set(a.family, arr);
			}
			arr.push(row);
		}
	}
	return [...groups.keys()]
		.sort((x, y) => FAMILY_ORDER[x] - FAMILY_ORDER[y])
		.map((family) => {
			const addresses = [...(groups.get(family) ?? [])].sort((a, b) => cmpIp(a.ip, b.ip));
			return { family, label: FAMILY_LABEL[family], count: addresses.length, addresses };
		});
}

export function buildFlat(visible: Instance[], ctx: SelectorCtx): FlatRow[] {
	const sb = ctx.settings.sortBy;
	const sorted = [...visible].sort((a, b) => {
		if (sb === "ip")
			return cmpIp(primaryIp(ctx.hosts.get(a.hostId)), primaryIp(ctx.hosts.get(b.hostId))) || a.name.localeCompare(b.name);
		if (sb === "lastseen") return (b.present ? 1 : 0) - (a.present ? 1 : 0) || a.name.localeCompare(b.name);
		return a.name.localeCompare(b.name) || a.serviceType.localeCompare(b.serviceType);
	});
	return sorted.map((it) => ({
		id: it.key,
		name: it.name,
		serviceType: it.serviceType,
		chip: primaryIp(ctx.hosts.get(it.hostId)),
		port: it.port,
		isNew: isNew(it, ctx.now),
		isLeft: isLeft(it),
		selected: ctx.selection?.kind === "inst" && ctx.selection.id === it.key,
	}));
}
