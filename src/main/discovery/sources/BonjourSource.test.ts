import { describe, expect, it, vi } from "vitest";
import {
	type BonjourLike,
	type BonjourLikeService,
	BonjourSource,
	type BrowserLike,
	decodeTxt,
	toDiscoveredService,
} from "./BonjourSource";

const sampleService: BonjourLikeService = {
	name: "Andy's Mac Studio",
	type: "airplay",
	protocol: "tcp",
	port: 7000,
	host: "Andy-Mac-Studio.local.",
	fqdn: "Andy's Mac Studio._airplay._tcp.local.",
	addresses: ["172.16.20.157", "fe80::1%en0"],
	txt: { model: "Mac14,14", flag: true, empty: null },
	ttl: 4500,
};

describe("decodeTxt", () => {
	it("keeps string values and records booleans/nulls as null", () => {
		const { txt, rawTxt } = decodeTxt({ model: "Mac14,14", flag: true, empty: null });
		expect(txt).toEqual({ model: "Mac14,14" });
		expect(rawTxt).toEqual([
			{ key: "model", value: "Mac14,14" },
			{ key: "flag", value: null },
			{ key: "empty", value: null },
		]);
	});
	it("decodes Buffer values as utf8", () => {
		const { txt } = decodeTxt({ k: Buffer.from("héllo", "utf8") });
		expect(txt.k).toBe("héllo");
	});
});

describe("toDiscoveredService", () => {
	it("maps a bonjour service to the DiscoveredService shape", () => {
		const d = toDiscoveredService(sampleService);
		expect(d.key).toBe("andy's mac studio._airplay._tcp.local.");
		expect(d.serviceType).toBe("_airplay._tcp");
		expect(d.protocol).toBe("tcp");
		expect(d.port).toBe(7000);
		expect(d.hostname).toBe("Andy-Mac-Studio.local.");
		expect(d.addresses).toEqual(["172.16.20.157", "fe80::1%en0"]);
		expect(d.txt).toEqual({ model: "Mac14,14" });
	});
});

describe("BonjourSource (injected factory)", () => {
	function fakeBonjour() {
		const handlers: Record<string, (s: BonjourLikeService) => void> = {};
		let errorCb: ((err: Error) => void) | undefined;
		const browser: BrowserLike = {
			on: (event, cb) => {
				handlers[event] = cb;
			},
			update: vi.fn(),
			expire: vi.fn(),
			stop: vi.fn(),
		};
		const engine: BonjourLike = {
			find: () => browser,
			destroy: vi.fn(),
			onError: (cb) => {
				errorCb = cb;
			},
		};
		return { engine, browser, handlers, emitError: (err: Error) => errorCb?.(err) };
	}

	it("emits an up SourceEvent mapped from a bonjour up event", () => {
		const f = fakeBonjour();
		const src = new BonjourSource({ createBonjour: () => f.engine });
		const seen = vi.fn();
		src.subscribe(seen);
		src.start();
		f.handlers.up!(sampleService);
		expect(seen).toHaveBeenCalledWith({
			type: "up",
			service: expect.objectContaining({
				key: "andy's mac studio._airplay._tcp.local.",
				serviceType: "_airplay._tcp",
				hostname: "Andy-Mac-Studio.local.",
			}),
		});
	});

	it("maps a bonjour down event to a down SourceEvent keyed by fqdn", () => {
		const f = fakeBonjour();
		const src = new BonjourSource({ createBonjour: () => f.engine });
		const seen = vi.fn();
		src.subscribe(seen);
		src.start();
		f.handlers.down!(sampleService);
		expect(seen).toHaveBeenCalledWith({ type: "down", key: "andy's mac studio._airplay._tcp.local." });
	});

	it("fans update() and expire() to every engine browser", () => {
		const f4 = fakeBonjour();
		const f6 = fakeBonjour();
		const src = new BonjourSource({ createBonjour: (kind) => (kind === "udp6" ? f6.engine : f4.engine) });
		src.start();
		src.update();
		src.expire();
		expect(f4.browser.update).toHaveBeenCalledTimes(1);
		expect(f6.browser.update).toHaveBeenCalledTimes(1);
		expect(f4.browser.expire).toHaveBeenCalledTimes(1);
		expect(f6.browser.expire).toHaveBeenCalledTimes(1);
	});

	it("skips engines whose factory returns null (e.g. no IPv6)", () => {
		const src = new BonjourSource({
			createBonjour: (kind) =>
				kind === "udp6" ? null : { find: () => ({ on() {}, update() {}, expire() {}, stop() {} }), destroy() {} },
		});
		expect(() => {
			src.start();
			src.update();
			src.stop();
		}).not.toThrow();
	});

	it("disables a transport that emits a fatal socket error, without throwing", () => {
		const f4 = fakeBonjour();
		const f6 = fakeBonjour();
		const warn = vi.fn();
		const src = new BonjourSource({
			createBonjour: (kind) => (kind === "udp6" ? f6.engine : f4.engine),
			warn,
		});
		src.start();
		expect(() => f6.emitError(new Error("bind EADDRNOTAVAIL fe80::1%10:5353"))).not.toThrow();
		// the udp6 transport is dropped; the udp4 transport keeps working
		src.update();
		expect(f4.browser.update).toHaveBeenCalledTimes(1);
		expect(f6.browser.update).not.toHaveBeenCalled();
		expect(f6.engine.destroy).toHaveBeenCalled();
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
