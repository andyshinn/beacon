import type { AddrFamily, Host, Instance } from "../../shared/types";
import type { Selection } from "../store/discoveryStore";
import { addrAllowed, cmpIp, primaryIp, relativeLastSeen } from "./presence";
import { visibleInstances } from "./selectors";
import { HOST_WEB_TYPES, INSTANCE_WEB_TYPES, serviceMeta, webUrl } from "./serviceTypes";

export type DetailIconKind = "instance" | "host" | "service" | "ip";
export interface DetailAction {
	id: string;
	label: string;
	icon: "ext" | "copy" | "resolve" | "reveal";
	primary: boolean;
	kind: "open" | "copy" | "resolve" | "reveal";
	value: string;
}
export interface DetailAddress {
	ip: string;
	endpoint: boolean;
	portText: string;
	copyValue: string;
}
export interface DetailAddrGroup {
	family: AddrFamily;
	label: string;
	addresses: DetailAddress[];
}
export interface MetaRow {
	label: string;
	value: string;
	font: "sans" | "mono";
	link?: { hostId: string };
	copyable?: boolean;
}
export interface ServiceRow {
	id: string;
	title: string;
	subtitle?: string;
	port: number;
}
export interface AdvertisedHost {
	id: string;
	name: string;
	sub: string;
	chip: string | null;
}
export interface TxtRow {
	key: string;
	value: string;
}
export interface DetailModel {
	kind: DetailIconKind;
	name: string;
	nameMono: boolean;
	status?: { live: boolean; label: string };
	sub?: string;
	serviceDesc?: string;
	actions: DetailAction[];
	addrTitle?: string;
	addrGroups: DetailAddrGroup[];
	meta: MetaRow[];
	servicesTitle?: string;
	services: ServiceRow[];
	hostsTitle?: string;
	hosts: AdvertisedHost[];
	hasTxt: boolean;
	txtTitle?: string;
	txt: TxtRow[];
	noTxt: boolean;
}
export interface DetailCtx {
	instances: Map<string, Instance>;
	hosts: Map<string, Host>;
	settings: { showDesc: boolean; showV6: boolean; showLinkLocal: boolean };
	query: string;
	now: number;
}

const FAMILY_ORDER: Record<AddrFamily, number> = { ipv4: 0, ipv6: 1, linklocal: 2, loopback: 3 };
const FAMILY_LABEL: Record<AddrFamily, string> = {
	ipv4: "IPv4",
	ipv6: "IPv6",
	linklocal: "Link-local",
	loopback: "Loopback",
};
const IP_TYPE_LABEL: Record<AddrFamily, string> = {
	ipv4: "IPv4 address",
	ipv6: "IPv6 address",
	linklocal: "Link-local address",
	loopback: "Loopback address",
};
const IP_SCOPE: Record<AddrFamily, string> = {
	ipv4: "Private (RFC 1918)",
	ipv6: "Unique local (ULA)",
	linklocal: "Link-local (fe80::/10)",
	loopback: "Loopback",
};

function addrGroups(host: Host, port: number, settings: DetailCtx["settings"]): DetailAddrGroup[] {
	const buckets = new Map<AddrFamily, Host["addresses"]>();
	for (const a of host.addresses) {
		if (!addrAllowed(a.family, settings)) continue;
		const arr = buckets.get(a.family) ?? [];
		if (!buckets.has(a.family)) buckets.set(a.family, arr);
		arr.push(a);
	}
	return [...buckets.keys()]
		.sort((x, y) => FAMILY_ORDER[x] - FAMILY_ORDER[y])
		.map((family) => ({
			family,
			label: FAMILY_LABEL[family],
			addresses: [...(buckets.get(family) ?? [])]
				.sort((a, b) => cmpIp(a.value, b.value))
				.map((a) => ({
					ip: a.value,
					endpoint: port > 0,
					portText: port > 0 ? `:${port}` : "",
					copyValue: port > 0 ? `${a.value}:${port}` : a.value,
				})),
		}));
}

function hostInstances(hostId: string, instances: Map<string, Instance>): Instance[] {
	return [...instances.values()]
		.filter((i) => i.hostId === hostId)
		.sort((a, b) => a.serviceType.localeCompare(b.serviceType));
}

function serviceRow(it: Instance, hostName: string | undefined): ServiceRow {
	return { id: it.key, title: it.serviceType, subtitle: it.name !== hostName ? it.name : undefined, port: it.port };
}

export function buildDetail(selection: Selection | null, ctx: DetailCtx): DetailModel | null {
	if (!selection) return null;
	if (selection.kind === "inst") return instanceDetail(selection.id, ctx);
	if (selection.kind === "host") return hostDetail(selection.id, ctx);
	if (selection.kind === "svc") return serviceDetail(selection.id, ctx);
	return ipDetail(selection.id, ctx);
}

function instanceDetail(id: string, ctx: DetailCtx): DetailModel | null {
	const it = ctx.instances.get(id);
	if (!it) return null;
	const h = ctx.hosts.get(it.hostId);
	const meta = serviceMeta(it.serviceType);
	const ip = primaryIp(h);
	const actions: DetailAction[] = [];
	if (INSTANCE_WEB_TYPES.has(it.serviceType)) {
		const url = webUrl(it.serviceType, ip, it.port);
		if (url) actions.push({ id: "open", label: "Open in Browser", icon: "ext", primary: true, kind: "open", value: url });
	}
	actions.push({
		id: "copy-host",
		label: "Copy Hostname",
		icon: "copy",
		primary: false,
		kind: "copy",
		value: h?.hostname ?? "",
	});
	actions.push({ id: "resolve", label: "Resolve", icon: "resolve", primary: false, kind: "resolve", value: it.key });
	actions.push({ id: "reveal", label: "Show Host", icon: "reveal", primary: false, kind: "reveal", value: h?.id ?? "" });

	const meta_rows: MetaRow[] = [];
	if (h) meta_rows.push({ label: "Host", value: h.displayName, font: "sans", link: { hostId: h.id } });
	if (h) meta_rows.push({ label: "Hostname", value: h.hostname, font: "mono", copyable: true });
	meta_rows.push({ label: "Service type", value: it.serviceType, font: "mono" });
	if (it.port > 0) meta_rows.push({ label: "Port", value: String(it.port), font: "mono" });
	meta_rows.push({ label: "Protocol", value: it.protocol.toUpperCase(), font: "sans" });
	meta_rows.push({ label: "Domain", value: "local.", font: "mono" });
	meta_rows.push({ label: "Last seen", value: relativeLastSeen(it.lastSeen, ctx.now, it.present), font: "sans" });

	const txt: TxtRow[] = Object.entries(it.txt).map(([key, value]) => ({ key, value }));
	return {
		kind: "instance",
		name: it.name,
		nameMono: false,
		status: it.present ? { live: true, label: "Live" } : { live: false, label: "Offline" },
		sub: `${it.serviceType}  ·  ${h?.hostname ?? ""}`,
		serviceDesc: ctx.settings.showDesc && meta.desc ? meta.desc : undefined,
		actions,
		addrTitle: "Addresses & Endpoints",
		addrGroups: h ? addrGroups(h, it.port, ctx.settings) : [],
		meta: meta_rows,
		services: [],
		hosts: [],
		hasTxt: txt.length > 0,
		txtTitle: txt.length > 0 ? `${txt.length} ${txt.length === 1 ? "record" : "records"}` : undefined,
		txt,
		noTxt: txt.length === 0,
	};
}

function hostDetail(id: string, ctx: DetailCtx): DetailModel | null {
	const h = ctx.hosts.get(id);
	if (!h) return null;
	const insts = hostInstances(h.id, ctx.instances);
	const ip = primaryIp(h);
	const actions: DetailAction[] = [];
	const webInst = insts.find((i) => HOST_WEB_TYPES.has(i.serviceType));
	if (webInst) {
		const url = webUrl(webInst.serviceType, ip, webInst.port);
		if (url) actions.push({ id: "open", label: "Open in Browser", icon: "ext", primary: true, kind: "open", value: url });
	}
	actions.push({ id: "copy-host", label: "Copy Hostname", icon: "copy", primary: false, kind: "copy", value: h.hostname });
	actions.push({ id: "copy-ip", label: "Copy IP", icon: "copy", primary: false, kind: "copy", value: ip ?? "" });

	return {
		kind: "host",
		name: h.displayName,
		nameMono: false,
		status: h.present ? { live: true, label: "Online" } : { live: false, label: "Offline" },
		sub: h.hostname,
		actions,
		addrTitle: "IP Addresses",
		addrGroups: addrGroups(h, 0, ctx.settings),
		meta: [
			{ label: "Hostname", value: h.hostname, font: "mono", copyable: true },
			{ label: "Addresses", value: String(h.addresses.length), font: "sans" },
			{ label: "Services", value: String(insts.length), font: "sans" },
			{ label: "Domain", value: "local.", font: "mono" },
			{ label: "Last seen", value: relativeLastSeen(h.lastSeen, ctx.now, h.present), font: "sans" },
		],
		servicesTitle: `Services advertised (${insts.length})`,
		services: insts.map((i) => serviceRow(i, h.displayName)),
		hosts: [],
		hasTxt: false,
		txt: [],
		noTxt: false,
	};
}

function serviceDetail(type: string, ctx: DetailCtx): DetailModel | null {
	const meta = serviceMeta(type);
	const visible = visibleInstances([...ctx.instances.values()], ctx.hosts, ctx.query).filter((i) => i.serviceType === type);
	if (visible.length === 0) return null;
	const seen = new Set<string>();
	const hosts: AdvertisedHost[] = [];
	for (const it of visible) {
		if (seen.has(it.hostId)) continue;
		seen.add(it.hostId);
		const h = ctx.hosts.get(it.hostId);
		hosts.push({ id: it.key, name: h?.displayName ?? it.hostId, sub: h?.hostname ?? "", chip: primaryIp(h) });
	}
	return {
		kind: "service",
		name: type,
		nameMono: true,
		serviceDesc: meta.desc || "Service type",
		actions: [],
		addrGroups: [],
		meta: [
			{ label: "Protocol", value: meta.proto.toUpperCase(), font: "sans" },
			{ label: "Instances", value: String(visible.length), font: "sans" },
			{ label: "Hosts", value: String(hosts.length), font: "sans" },
			{ label: "Domain", value: "local.", font: "mono" },
		],
		services: [],
		hostsTitle: "Advertised by",
		hosts,
		hasTxt: false,
		txt: [],
		noTxt: false,
	};
}

function ipDetail(id: string, ctx: DetailCtx): DetailModel | null {
	const [hid, ip] = id.split("|");
	const h = hid ? ctx.hosts.get(hid) : undefined;
	if (!h || !ip) return null;
	const addr = h.addresses.find((a) => a.value === ip);
	const family: AddrFamily = addr?.family ?? "ipv4";
	const insts = [...ctx.instances.values()]
		.filter((i) => i.hostId === h.id)
		.sort((a, b) => a.serviceType.localeCompare(b.serviceType));
	const actions: DetailAction[] = [];
	const webInst = insts.find((i) => HOST_WEB_TYPES.has(i.serviceType));
	if (webInst) {
		const url = webUrl(webInst.serviceType, ip, webInst.port);
		if (url)
			actions.push({
				id: "open",
				label: `Open ${url.replace(/:\d+$/, "")}`,
				icon: "ext",
				primary: true,
				kind: "open",
				value: url,
			});
	}
	actions.push({ id: "copy-ip", label: "Copy IP", icon: "copy", primary: false, kind: "copy", value: ip });
	actions.push({ id: "reveal", label: "Show Host", icon: "reveal", primary: false, kind: "reveal", value: h.id });

	return {
		kind: "ip",
		name: ip,
		nameMono: true,
		sub: `${IP_TYPE_LABEL[family]}  ·  ${h.displayName}`,
		actions,
		addrGroups: [],
		meta: [
			{ label: "Type", value: IP_TYPE_LABEL[family], font: "sans" },
			{ label: "Scope", value: IP_SCOPE[family], font: "sans" },
			{ label: "Host", value: h.displayName, font: "sans", link: { hostId: h.id } },
			{ label: "Hostname", value: h.hostname, font: "mono", copyable: true },
		],
		servicesTitle: `Services on this host (${insts.length})`,
		services: insts.map((i) => serviceRow(i, h.displayName)),
		hosts: [],
		hasTxt: false,
		txt: [],
		noTxt: false,
	};
}
