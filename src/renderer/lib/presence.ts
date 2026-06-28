import type { AddrFamily, Host, Instance } from "../../shared/types";

export const NEW_WINDOW_MS = 6000;
export const AGING_AGE_S = 5;
export const STALE_AGE_S = 12;

const FAMILY_ORDER: Record<AddrFamily, number> = { ipv4: 0, ipv6: 1, linklocal: 2, loopback: 3 };

export function primaryIp(host: Host | undefined): string | null {
	if (!host || host.addresses.length === 0) return null;
	const best = [...host.addresses].sort((a, b) => FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family])[0];
	return best ? best.value : null;
}

export function isNew(inst: Instance, now: number): boolean {
	return inst.present && now - inst.firstSeen < NEW_WINDOW_MS;
}

export function isLeft(inst: Instance): boolean {
	return !inst.present;
}

const V4 = /^\d+\.\d+\.\d+\.\d+$/;
export function cmpIp(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a == null) return 1;
	if (b == null) return -1;
	if (V4.test(a) && V4.test(b)) {
		const pa = a.split(".").map(Number);
		const pb = b.split(".").map(Number);
		for (let i = 0; i < 4; i++) {
			const d = (pa[i] ?? 0) - (pb[i] ?? 0);
			if (d !== 0) return d;
		}
		return 0;
	}
	return a.localeCompare(b);
}

export function trunc(s: string): string {
	return s.length > 44 ? `${s.slice(0, 42)}…` : s;
}

export type Staleness = "fresh" | "aging" | "stale";
export function staleness(live: boolean, pausedAgeS: number): Staleness {
	if (live) return "fresh";
	if (pausedAgeS >= STALE_AGE_S) return "stale";
	if (pausedAgeS >= AGING_AGE_S) return "aging";
	return "fresh";
}

export function ageLabel(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function relativeLastSeen(lastSeen: number, now: number, present: boolean): string {
	if (present) return "just now";
	return `${Math.max(1, Math.round((now - lastSeen) / 1000))}s ago`;
}

export interface ShowToggles {
	showV6: boolean;
	showLinkLocal: boolean;
}
export function addrAllowed(family: AddrFamily, t: ShowToggles): boolean {
	if (family === "ipv6" && !t.showV6) return false;
	if (family === "linklocal" && !t.showLinkLocal) return false;
	return true;
}
