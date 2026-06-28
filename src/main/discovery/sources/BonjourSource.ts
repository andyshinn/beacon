import { networkInterfaces } from "node:os";
import { Bonjour } from "bonjour-service";
import type { DiscoveredService, DiscoverySource, RawTxtEntry, SourceEvent } from "../../../shared/types";
import { instanceKey } from "../identity";

export interface BonjourLikeService {
	name: string;
	type: string;
	protocol: "tcp" | "udp";
	port: number;
	host: string;
	fqdn: string;
	addresses?: string[];
	txt?: Record<string, unknown>;
	ttl?: number;
}

export interface BrowserLike {
	on(event: string, cb: (s: BonjourLikeService) => void): void;
	update(): void;
	expire(): void;
	stop(): void;
}

export interface BonjourLike {
	find(opts: null): BrowserLike;
	destroy(): void;
	// Attach a handler for a fatal socket error (e.g. a udp6 bind failure). Optional so
	// injected test factories may omit it; the default factory wires it to the underlying
	// multicast-dns socket's 'error' event.
	onError?(cb: (err: Error) => void): void;
}

export type BonjourFactory = (kind: "udp4" | "udp6") => BonjourLike | null;

export function decodeTxt(txt: Record<string, unknown>): { txt: Record<string, string>; rawTxt: RawTxtEntry[] } {
	const out: Record<string, string> = {};
	const raw: RawTxtEntry[] = [];
	for (const [key, v] of Object.entries(txt)) {
		if (v === true || v === null || v === undefined) {
			raw.push({ key, value: null });
		} else if (Buffer.isBuffer(v)) {
			const s = v.toString("utf8");
			out[key] = s;
			raw.push({ key, value: s });
		} else {
			const s = String(v);
			out[key] = s;
			raw.push({ key, value: s });
		}
	}
	return { txt: out, rawTxt: raw };
}

export function toDiscoveredService(s: BonjourLikeService): DiscoveredService {
	const { txt, rawTxt } = decodeTxt(s.txt ?? {});
	return {
		key: instanceKey(s.fqdn),
		name: s.name,
		serviceType: `_${s.type}._${s.protocol}`,
		protocol: s.protocol,
		port: s.port,
		hostname: s.host,
		addresses: s.addresses ?? [],
		txt,
		rawTxt,
		ttl: s.ttl,
	};
}

function defaultIpv6InterfaceAddress(): string | undefined {
	const ifaces = networkInterfaces();
	for (const addrs of Object.values(ifaces)) {
		for (const a of addrs ?? []) {
			if (a.family === "IPv6" && !a.internal && a.address.toLowerCase().startsWith("fe80")) {
				return a.scopeid ? `${a.address}%${a.scopeid}` : a.address;
			}
		}
	}
	return undefined;
}

// The slice of bonjour-service we reach into: server.mdns is the multicast-dns socket
// wrapper, whose 'error' event fires on a bind failure (bonjour-service does not handle it).
interface RawBonjour {
	find(opts: null): BrowserLike;
	destroy(): void;
	server?: { mdns?: { on?(event: string, cb: (err: Error) => void): void } };
}

const defaultFactory: BonjourFactory = (kind) => {
	let raw: RawBonjour;
	if (kind === "udp4") {
		raw = new Bonjour() as unknown as RawBonjour;
	} else {
		const iface = defaultIpv6InterfaceAddress();
		if (!iface) return null;
		// udp6 option shape isn't in bonjour-service's types; verified live via scripts/discover.ts
		raw = new Bonjour({ type: "udp6", ip: "ff02::fb", interface: iface } as never) as unknown as RawBonjour;
	}
	return {
		find: (opts) => raw.find(opts),
		destroy: () => raw.destroy(),
		onError: (cb) => raw.server?.mdns?.on?.("error", cb),
	};
};

interface EngineRecord {
	engine: BonjourLike;
	browser: BrowserLike;
}

export class BonjourSource implements DiscoverySource {
	private readonly createBonjour: BonjourFactory;
	private readonly warn: (message: string) => void;
	private records: EngineRecord[] = [];
	private listeners = new Set<(event: SourceEvent) => void>();

	constructor(options?: { createBonjour?: BonjourFactory; warn?: (message: string) => void }) {
		this.createBonjour = options?.createBonjour ?? defaultFactory;
		this.warn = options?.warn ?? ((message) => console.warn(message));
	}

	start(): void {
		for (const kind of ["udp4", "udp6"] as const) {
			const engine = this.createBonjour(kind);
			if (!engine) continue;
			// Catch fatal socket errors (e.g. a udp6 bind EADDRNOTAVAIL on a link-local
			// interface) so one failing transport degrades gracefully instead of crashing
			// the process with an unhandled 'error' event.
			engine.onError?.((err) => this.handleEngineError(kind, engine, err));
			const browser = engine.find(null);
			browser.on("up", (s) => this.emit({ type: "up", service: toDiscoveredService(s) }));
			browser.on("srv-update", (s) => this.emit({ type: "srv-update", service: toDiscoveredService(s) }));
			browser.on("txt-update", (s) => this.emit({ type: "txt-update", service: toDiscoveredService(s) }));
			browser.on("down", (s) => this.emit({ type: "down", key: instanceKey(s.fqdn) }));
			this.records.push({ engine, browser });
		}
	}

	stop(): void {
		for (const { engine, browser } of this.records) {
			browser.stop();
			engine.destroy();
		}
		this.records = [];
	}

	update(): void {
		for (const { browser } of this.records) browser.update();
	}

	expire(): void {
		for (const { browser } of this.records) browser.expire();
	}

	subscribe(listener: (event: SourceEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private handleEngineError(kind: "udp4" | "udp6", engine: BonjourLike, err: Error): void {
		const idx = this.records.findIndex((r) => r.engine === engine);
		if (idx >= 0) {
			const [rec] = this.records.splice(idx, 1);
			if (rec) {
				try {
					rec.browser.stop();
				} catch {
					/* socket already torn down */
				}
				try {
					rec.engine.destroy();
				} catch {
					/* socket already torn down */
				}
			}
		}
		this.warn(`[discovery] ${kind} transport disabled after socket error: ${err.message}`);
	}

	private emit(event: SourceEvent): void {
		for (const l of [...this.listeners]) l(event);
	}
}
