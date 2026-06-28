# Beacon Packaging & Distribution Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Beacon produce correct, runnable unsigned installers for macOS/Windows/Linux, ship the externalized discovery dependency into the package, declare the macOS Local Network permission, and warn the user when that permission appears to be denied.

**Architecture:** Electron Forge + the Vite plugin already build the app; this plan fixes three packaging-correctness gaps and adds one feature. (1) The Forge Vite plugin sets `packagerConfig.ignore` to strip **everything** except `/.vite`, so the ESM-externalized `bonjour-service` (and its transitive deps) never ship — the app silently fails to start discovery once moved out of the source tree. A custom `ignore` ships exactly that runtime closure. (2) macOS Sequoia gates mDNS behind a Local Network TCC permission; we declare `NSLocalNetworkUsageDescription` via `packagerConfig.extendInfo` and pin a stable `appBundleId` so grants survive rebuilds. (3) A darwin-only, advisory, dismissable health check in the main process emits an IPC event when no instances arrive within ~5s of going live; the renderer surfaces a banner with an "Open Settings" deep link. (4) A packaged-build smoke gate proves the externalized import resolves from inside `app.asar` and the Info.plist is correct.

**Tech Stack:** Electron 42 · `@electron-forge/*@8.0.0-alpha.9` (plugin-vite, maker-{dmg,zip,squirrel,deb,rpm}, plugin-fuses, plugin-auto-unpack-natives) · Vite 8 (Rolldown) · `bonjour-service@^1.4.2` · React 19 · zustand 5 · Vitest 4 (node + happy-dom projects) · Biome 2.5.1.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec (`docs/superpowers/specs/2026-06-27-beacon-mdns-browser-design.md`) and the verified packaging facts.

- **GC-1 — Unsigned local builds only.** No code signing, notarization, or auto-update (spec §11). Do not add `osxSign`, `osxNotarize`, or publishers.
- **GC-2 — Main bundle is ESM with externalized CJS deps.** `electron`, `bonjour-service`, and all node builtins are externalized in `vite.main.config.mts` (see memory `esm-build-constraints`). Do **not** bundle `bonjour-service` and do **not** change that externalization — the documented fix for the "require is not defined" / `__require` crash depends on it.
- **GC-3 — The runtime dependency closure MUST ship into the package.** The Forge Vite plugin defaults `packagerConfig.ignore` to `(file) => !file.startsWith("/.vite")`, which strips all of `node_modules`. A custom `packagerConfig.ignore` must keep `/.vite`, `/package.json`, and exactly this closure: `bonjour-service`, `multicast-dns`, `dns-packet`, `thunky`, `fast-deep-equal`, `@leichtgewicht/ip-codec`. **Verified on Electron 42.5.0:** these pure-JS packages resolve via ESM from **inside** `app.asar` — no `asar.unpack` is required.
- **GC-4 — macOS Local Network declaration.** Add `NSLocalNetworkUsageDescription` to the packaged Info.plist via `packagerConfig.extendInfo`, and set a stable `appBundleId` (`com.andyshinn.beacon`) so the TCC grant persists across rebuilds (the default `com.electron.beacon` would re-prompt). Do **not** request `com.apple.developer.networking.multicast` (iOS-only; spec §3.4).
- **GC-5 — Permission health check is conservative.** darwin-only, advisory copy, dismissable, fires **at most once per launch**, triggered solely by "no instance responses within ~5s of going live" (spec §3.4, §12). EHOSTUNREACH-on-send is **not** reliably catchable through `bonjour-service`/`multicast-dns`, so the timeout heuristic is the chosen mechanism, which the spec explicitly sanctions ("…or no responses within a few seconds").
- **GC-6 — Preload stays CommonJS.** `sandbox: true` in `main.ts`; preload has no ESM context. Do not touch `vite.preload.config.mts` or the preload module type.
- **GC-7 — Tooling.** Biome: tabs, double quotes, `lineWidth: 125`. Tests live in two Vitest projects: **node** (`src/main/**`, `src/shared/**`, `tests/**`) and **happy-dom** (`src/renderer/**`, setup `src/renderer/test-setup.ts`). New main/shared/tooling tests go under the node project's globs; new renderer tests under happy-dom.
- **GC-8 — Browse-only, single-window.** No new advertising/publishing, no multi-window. The IPC handlers are process-global and re-registered per window (single-window assumption holds).

---

## File Structure

**Create:**
- `scripts/packageIgnore.ts` — pure `keepInPackage(file)` predicate + `RUNTIME_DEPS` (the inverse of Forge's strip-everything ignore). Lives in `scripts/` (already in `tsconfig` `include`); imported by `forge.config.ts`.
- `tests/packageIgnore.test.ts` — node-project unit test for the predicate.
- `src/main/discovery/permissionHealth.ts` — `LocalNetworkHealthCheck` (pure, injectable timers) + `HealthCheck` interface.
- `src/main/discovery/permissionHealth.test.ts` — node-project unit test (fake timers).
- `src/renderer/components/PermissionBanner.tsx` + `PermissionBanner.module.css` — the dismissable advisory banner.
- `src/renderer/components/PermissionBanner.test.tsx` — happy-dom component test.
- `scripts/smoke-package.sh` — packaged-build verification (relocate + boot + assert closure resolves + assert Info.plist).

**Modify:**
- `forge.config.ts` — custom `ignore`, `appBundleId`, `extendInfo`.
- `src/shared/types.ts` — `DiscoveryHealth`.
- `src/shared/ipc.ts` — `IPC.health`, `IPC.openLocalNetworkSettings`, `HealthPayload`.
- `src/main/discovery/DiscoveryManager.ts` — `healthCheck` option, lifecycle wiring, `health` ManagerEvent.
- `src/main/ipc/registerDiscoveryIpc.ts` — construct the health check (darwin gate), route the health event, register the settings-deep-link handler.
- `src/main/main.ts` — startup marker log (deterministic smoke signal).
- `src/preload/preload.ts` — `onHealth`, `openLocalNetworkSettings`.
- `src/shared/beacon-api.ts` — extend `BeaconApi`.
- `src/renderer/store/discoveryStore.ts` — `permissionHint` state + actions.
- `src/renderer/store/discoveryStore.test.ts` — cover the new actions.
- `src/renderer/main.tsx` — wire `onHealth` → `showPermissionHint`.
- `src/renderer/App.tsx` — render `<PermissionBanner/>`.

---

## Task 1: Forge packaging config — ship the dependency closure + macOS Info.plist

**Files:**
- Create: `scripts/packageIgnore.ts`
- Test: `tests/packageIgnore.test.ts`
- Modify: `forge.config.ts`

**Interfaces:**
- Produces: `keepInPackage(file: string): boolean` and `RUNTIME_DEPS: readonly string[]` from `scripts/packageIgnore.ts`. `forge.config.ts` consumes `keepInPackage` as `ignore: (file) => !keepInPackage(file)`.

**Background (why this task exists):** With the stock config the packaged `app.asar` contained only 11 entries — `/.vite/**` and `/package.json`, **no `node_modules`**. The main bundle does `import { Bonjour } from "bonjour-service"` (externalized per GC-2), so a relocated `.app` (e.g. dragged to `/Applications`) silently fails to start discovery. Verified fix: a custom `ignore` that also keeps the bonjour-service closure raises the asar to ~128 entries and the relocated app starts discovery. ESM resolves the closure from **inside** the asar on Electron 42.5.0 — no `asar.unpack`.

- [ ] **Step 1: Write the failing predicate test**

Create `tests/packageIgnore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keepInPackage, RUNTIME_DEPS } from "../scripts/packageIgnore";

describe("keepInPackage", () => {
	it("keeps the Vite build output", () => {
		expect(keepInPackage("/.vite/build/main.js")).toBe(true);
		expect(keepInPackage("/.vite/renderer/main_window/index.html")).toBe(true);
	});

	it("keeps the root package.json", () => {
		expect(keepInPackage("/package.json")).toBe(true);
	});

	it("keeps the node_modules dir entry so packager descends into it", () => {
		expect(keepInPackage("/node_modules")).toBe(true);
	});

	it("keeps every runtime-closure package", () => {
		expect(keepInPackage("/node_modules/bonjour-service/dist/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/multicast-dns/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/dns-packet/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/thunky/index.js")).toBe(true);
		expect(keepInPackage("/node_modules/fast-deep-equal/index.js")).toBe(true);
	});

	it("keeps a scoped closure package and its scope dir entry", () => {
		expect(keepInPackage("/node_modules/@leichtgewicht")).toBe(true);
		expect(keepInPackage("/node_modules/@leichtgewicht/ip-codec/index.js")).toBe(true);
	});

	it("drops dev dependencies", () => {
		expect(keepInPackage("/node_modules/typescript/lib/tsc.js")).toBe(false);
		expect(keepInPackage("/node_modules/vite/dist/node/index.js")).toBe(false);
	});

	it("drops project source the Vite plugin already bundled", () => {
		expect(keepInPackage("/src/main/main.ts")).toBe(false);
		expect(keepInPackage("/forge.config.ts")).toBe(false);
	});

	it("does not capture a package that merely prefixes a closure member", () => {
		expect(keepInPackage("/node_modules/bonjour-service-extra/index.js")).toBe(false);
	});

	it("exposes the closure for maintenance", () => {
		expect(RUNTIME_DEPS).toContain("bonjour-service");
		expect(RUNTIME_DEPS).toContain("@leichtgewicht/ip-codec");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/packageIgnore.test.ts`
Expected: FAIL — `Failed to resolve import "../scripts/packageIgnore"` (module does not exist yet).

- [ ] **Step 3: Implement the predicate**

Create `scripts/packageIgnore.ts`:

```ts
// The @electron-forge/plugin-vite plugin defaults packagerConfig.ignore to
// `(file) => !file.startsWith("/.vite")`, which strips ALL of node_modules from the
// packaged app. Our main bundle is ESM and externalizes bonjour-service (see
// esm-build-constraints / vite.main.config.mts), so the dependency must ship UNBUNDLED
// or the externalized `import "bonjour-service"` cannot resolve once the .app leaves the
// source tree — discovery then silently never starts. keepInPackage() is the inverse of
// Forge's ignore: it keeps the Vite output, the root package.json, and exactly the
// bonjour-service runtime closure. Verified on Electron 42.5.0 that these pure-JS packages
// resolve via ESM from INSIDE app.asar (no asar.unpack). If bonjour-service's dependency
// tree changes, update RUNTIME_DEPS; scripts/smoke-package.sh catches a missing member.
export const RUNTIME_DEPS = [
	"bonjour-service",
	"multicast-dns",
	"dns-packet",
	"thunky",
	"fast-deep-equal",
	"@leichtgewicht/ip-codec",
] as const;

export function keepInPackage(file: string): boolean {
	if (!file) return true; // packager probes the root with "" — mirror Forge's keep
	if (file.startsWith("/.vite")) return true;
	if (file === "/package.json") return true;
	if (file === "/node_modules") return true; // keep the dir entry so packager descends
	for (const dep of RUNTIME_DEPS) {
		const base = `/node_modules/${dep}`;
		if (file === base || file.startsWith(`${base}/`)) return true;
		if (dep.startsWith("@")) {
			const scope = `/node_modules/${dep.slice(0, dep.indexOf("/"))}`;
			if (file === scope) return true; // keep the scope dir entry so packager descends
		}
	}
	return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/packageIgnore.test.ts`
Expected: PASS — 9 tests pass.

- [ ] **Step 5: Wire `forge.config.ts`**

In `forge.config.ts`, add the import after the existing imports:

```ts
import { keepInPackage } from "./scripts/packageIgnore";
```

Replace the `packagerConfig` line:

```ts
	packagerConfig: { asar: true },
```

with:

```ts
	packagerConfig: {
		asar: true,
		appBundleId: "com.andyshinn.beacon",
		extendInfo: {
			// macOS Sequoia (15+) gates mDNS behind the Local Network TCC permission, even for
			// a packaged double-clicked .app. This string is shown in the system permission prompt.
			NSLocalNetworkUsageDescription:
				"Beacon scans your local network to discover Bonjour and mDNS services so it can show the devices around you.",
		},
		// Override the Vite plugin's strip-everything ignore so the externalized bonjour-service
		// closure ships (see scripts/packageIgnore.ts). The plugin respects a user-set function ignore.
		ignore: (file: string) => !keepInPackage(file),
	},
```

Leave `makers`, `rebuildConfig`, `plugins` (AutoUnpackNatives, Vite, Fuses) unchanged.

- [ ] **Step 6: Verify typecheck + lint + full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck clean; lint clean; all tests pass (existing suite + the 9 new predicate tests).

(The end-to-end packaged-build proof — that the closure actually ships and resolves, and that the Info.plist carries the new keys — is Task 6. This task's gate is the predicate unit test + a clean typecheck/lint, confirming the config compiles and the predicate is correct.)

- [ ] **Step 7: Commit**

```bash
git add scripts/packageIgnore.ts tests/packageIgnore.test.ts forge.config.ts
git commit -m "feat(packaging): ship bonjour-service closure + macOS Local Network Info.plist"
```

---

## Task 2: Local Network permission health check (pure, main process)

**Files:**
- Create: `src/main/discovery/permissionHealth.ts`
- Test: `src/main/discovery/permissionHealth.test.ts`

**Interfaces:**
- Produces:
  - `interface HealthCheck { arm(onWarn: () => void): void; noteActivity(): void; cancel(): void; }`
  - `class LocalNetworkHealthCheck implements HealthCheck` with constructor `(options: LocalNetworkHealthOptions)`.
  - `interface LocalNetworkHealthOptions { enabled: boolean; timeoutMs?: number; setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>; clearTimer?: (handle: ReturnType<typeof setTimeout>) => void; }`
- Consumed by Task 3 (`DiscoveryManager`) and constructed in Task 4 (`registerDiscoveryIpc`, with `enabled: process.platform === "darwin"`).

**Behavior:** `arm(onWarn)` starts a one-shot timer (default 5000ms); if it fires before any activity, it calls `onWarn` exactly once and latches. `noteActivity()` marks the check resolved (healthy) and cancels any pending timer — once any instance has ever been seen, the check never warns. `cancel()` clears a pending timer without latching (used on pause). When `enabled` is false (non-darwin), `arm` is a no-op.

- [ ] **Step 1: Write the failing test**

Create `src/main/discovery/permissionHealth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalNetworkHealthCheck } from "./permissionHealth";

describe("LocalNetworkHealthCheck", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("warns once after the timeout when no activity arrives", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
		check.arm(warn);
		expect(warn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(5000);
		expect(warn).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(10_000);
		expect(warn).toHaveBeenCalledTimes(1); // latched
	});

	it("does not warn when activity arrives before the timeout", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
		check.arm(warn);
		vi.advanceTimersByTime(3000);
		check.noteActivity();
		vi.advanceTimersByTime(10_000);
		expect(warn).not.toHaveBeenCalled();
	});

	it("never warns again once activity has been seen", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
		check.noteActivity();
		check.arm(warn);
		vi.advanceTimersByTime(10_000);
		expect(warn).not.toHaveBeenCalled();
	});

	it("cancel() clears a pending warning", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
		check.arm(warn);
		check.cancel();
		vi.advanceTimersByTime(10_000);
		expect(warn).not.toHaveBeenCalled();
	});

	it("does nothing when disabled (non-darwin)", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: false, timeoutMs: 5000 });
		check.arm(warn);
		vi.advanceTimersByTime(10_000);
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not start a second timer if armed twice", () => {
		const warn = vi.fn();
		const check = new LocalNetworkHealthCheck({ enabled: true, timeoutMs: 5000 });
		check.arm(warn);
		check.arm(warn);
		vi.advanceTimersByTime(5000);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/main/discovery/permissionHealth.test.ts`
Expected: FAIL — cannot resolve `./permissionHealth`.

- [ ] **Step 3: Implement the health check**

Create `src/main/discovery/permissionHealth.ts`:

```ts
// Darwin-only advisory check for the macOS Local Network TCC permission. The permission
// fails SILENTLY (mDNS sends yield no responses) and is not reliably catchable as a socket
// error through bonjour-service/multicast-dns, so we use the spec-sanctioned heuristic:
// if no instance responses arrive within a few seconds of going live, warn the user once.
// See GC-5. Timers are injectable for fake-timer tests.
type Timer = ReturnType<typeof setTimeout>;

export interface HealthCheck {
	arm(onWarn: () => void): void;
	noteActivity(): void;
	cancel(): void;
}

export interface LocalNetworkHealthOptions {
	enabled: boolean;
	timeoutMs?: number;
	setTimer?: (cb: () => void, ms: number) => Timer;
	clearTimer?: (handle: Timer) => void;
}

export class LocalNetworkHealthCheck implements HealthCheck {
	private readonly enabled: boolean;
	private readonly timeoutMs: number;
	private readonly setTimer: (cb: () => void, ms: number) => Timer;
	private readonly clearTimer: (handle: Timer) => void;
	private timer?: Timer;
	private resolved = false; // latched once activity is seen OR a warning has fired

	constructor(options: LocalNetworkHealthOptions) {
		this.enabled = options.enabled;
		this.timeoutMs = options.timeoutMs ?? 5000;
		this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
		this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
	}

	arm(onWarn: () => void): void {
		if (!this.enabled || this.resolved || this.timer !== undefined) return;
		this.timer = this.setTimer(() => {
			this.timer = undefined;
			if (this.resolved) return;
			this.resolved = true;
			onWarn();
		}, this.timeoutMs);
	}

	noteActivity(): void {
		this.resolved = true;
		this.stopTimer();
	}

	cancel(): void {
		this.stopTimer();
	}

	private stopTimer(): void {
		if (this.timer !== undefined) {
			this.clearTimer(this.timer);
			this.timer = undefined;
		}
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/main/discovery/permissionHealth.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/discovery/permissionHealth.ts src/main/discovery/permissionHealth.test.ts
git commit -m "feat(discovery): add darwin Local Network permission health check"
```

---

## Task 3: Wire the health check into DiscoveryManager

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/discovery/DiscoveryManager.ts`
- Test: `src/main/discovery/DiscoveryManager.test.ts` (add cases)

**Interfaces:**
- Consumes: `HealthCheck` from `./permissionHealth` (Task 2).
- Produces:
  - `DiscoveryHealth` in `src/shared/types.ts`: `interface DiscoveryHealth { warning: "local-network"; }`.
  - `ManagerEvent` gains `| { type: "health"; health: DiscoveryHealth }`.
  - `DiscoveryManagerOptions` gains `healthCheck?: HealthCheck`.

- [ ] **Step 1: Add the `DiscoveryHealth` type**

In `src/shared/types.ts`, append after the `DiscoveryStatus` interface:

```ts
export interface DiscoveryHealth {
	warning: "local-network";
}
```

- [ ] **Step 2: Write the failing manager tests**

In `src/main/discovery/DiscoveryManager.test.ts`, add a controllable fake health check helper near the top (after the existing `collector()` helper):

```ts
function fakeHealth() {
	let warn: (() => void) | undefined;
	return {
		armed: 0,
		noted: 0,
		cancelled: 0,
		arm(onWarn: () => void) {
			this.armed++;
			warn = onWarn;
		},
		noteActivity() {
			this.noted++;
		},
		cancel() {
			this.cancelled++;
		},
		triggerWarn() {
			warn?.();
		},
	};
}
```

Add these cases inside the `describe("DiscoveryManager", ...)` block:

```ts
it("arms the health check on start and notes activity on an up event", () => {
	const source = new FakeSource();
	const { onEvent } = collector();
	const health = fakeHealth();
	new DiscoveryManager({ source, onEvent, healthCheck: health }).start();
	expect(health.armed).toBe(1);
	source.emit({
		type: "up",
		service: makeService({ name: "Porch", serviceType: "_http._tcp", hostname: "porch.local.", addresses: ["172.16.20.170"] }),
	});
	expect(health.noted).toBeGreaterThanOrEqual(1);
});

it("emits a health event when the health check warns", () => {
	const source = new FakeSource();
	const { events, onEvent } = collector();
	const health = fakeHealth();
	new DiscoveryManager({ source, onEvent, healthCheck: health }).start();
	health.triggerWarn();
	expect(events).toContainEqual({ type: "health", health: { warning: "local-network" } });
});

it("cancels the health check when paused", () => {
	const source = new FakeSource();
	const { onEvent } = collector();
	const health = fakeHealth();
	const manager = new DiscoveryManager({ source, onEvent, healthCheck: health });
	manager.start();
	manager.setLive(false);
	expect(health.cancelled).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run src/main/discovery/DiscoveryManager.test.ts`
Expected: FAIL — `healthCheck` is not a known option and no `health` event is emitted.

- [ ] **Step 4: Wire the manager**

In `src/main/discovery/DiscoveryManager.ts`:

Update the imports and the `ManagerEvent` union:

```ts
import type {
	DiscoveryDelta,
	DiscoveryHealth,
	DiscoverySnapshot,
	DiscoverySource,
	DiscoveryStatus,
	SourceEvent,
} from "../../shared/types";
import type { HealthCheck } from "./permissionHealth";
import { DiscoveryStore } from "./store";

export type ManagerEvent =
	| { type: "snapshot"; snapshot: DiscoverySnapshot }
	| { type: "delta"; delta: DiscoveryDelta }
	| { type: "status"; status: DiscoveryStatus }
	| { type: "health"; health: DiscoveryHealth };
```

Add to `DiscoveryManagerOptions`:

```ts
	healthCheck?: HealthCheck;
```

Add a private field (next to the other `private readonly` fields):

```ts
	private readonly healthCheck?: HealthCheck;
```

Assign it in the constructor (next to the other assignments):

```ts
		this.healthCheck = options.healthCheck;
```

In `start()`, after `this.emitStatus(false);`, arm the check:

```ts
		this.healthCheck?.arm(() => this.emitHealth());
```

In `setLive(on)`, in the `if (on)` branch after `this.live = true;`, re-arm; in the `else` branch after `this.live = false;`, cancel:

```ts
		if (on) {
			if (!this.unsubscribe) {
				this.unsubscribe = this.source.subscribe((e) => this.handleSourceEvent(e));
			}
			this.source.start();
			this.startTimer();
			this.live = true;
			this.healthCheck?.arm(() => this.emitHealth());
		} else {
			this.stopTimer();
			this.source.stop();
			this.live = false;
			this.healthCheck?.cancel();
		}
```

In `stop()`, after `this.live = false;`, cancel:

```ts
		this.healthCheck?.cancel();
```

In `handleSourceEvent(e)`, note activity for any non-`down` event (a real service response):

```ts
	private handleSourceEvent(e: SourceEvent): void {
		if (e.type !== "down") this.healthCheck?.noteActivity();
		const delta = e.type === "down" ? this.store.markDown(e.key, this.now()) : this.store.upsert(e.service, this.now());
		if (hasDelta(delta)) this.onEvent({ type: "delta", delta });
	}
```

Add the `emitHealth` method next to `emitStatus`:

```ts
	private emitHealth(): void {
		this.onEvent({ type: "health", health: { warning: "local-network" } });
	}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run src/main/discovery/DiscoveryManager.test.ts`
Expected: PASS — existing manager tests plus the 3 new cases pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/discovery/DiscoveryManager.ts src/main/discovery/DiscoveryManager.test.ts
git commit -m "feat(discovery): drive permission health check from DiscoveryManager"
```

---

## Task 4: IPC + preload + beacon-api plumbing (health event + Open Settings)

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc/registerDiscoveryIpc.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/shared/beacon-api.ts`

**Interfaces:**
- Produces:
  - `IPC.health = "discovery:health"`, `IPC.openLocalNetworkSettings = "command:openLocalNetworkSettings"`.
  - `HealthPayload = DiscoveryHealth` in `src/shared/ipc.ts`.
  - `BeaconApi.onHealth(listener: (h: HealthPayload) => void): Unsubscribe` and `BeaconApi.openLocalNetworkSettings(): Promise<void>`.
- Consumes: `LocalNetworkHealthCheck` from `../discovery/permissionHealth` (constructed with `enabled: process.platform === "darwin"`).

**Note on testing:** the cross-process contract (contextBridge subscribe, IPC constants) follows the existing un-unit-tested plumbing in `preload.ts` / `registerDiscoveryIpc.ts` (the latter constructs a real `BonjourSource` that opens sockets, so it is intentionally not unit-tested). The behavioral logic this task introduces — the health check itself and the manager emitting the event — is already covered by Tasks 2 and 3. This task's gate is `pnpm typecheck` (contract consistency across main/preload/renderer) plus the full suite staying green; the packaged-build e2e is Task 6.

- [ ] **Step 1: Extend the IPC contract**

In `src/shared/ipc.ts`, import `DiscoveryHealth` and add the channels + payload:

```ts
import type { DiscoveryDelta, DiscoveryHealth, DiscoverySnapshot, DiscoveryStatus } from "./types";

export const IPC = {
	snapshot: "discovery:snapshot",
	delta: "discovery:delta",
	status: "discovery:status",
	health: "discovery:health",
	rescan: "command:rescan",
	setLive: "command:setLive",
	resolve: "command:resolve",
	getSnapshot: "command:getSnapshot",
	openExternal: "command:openExternal",
	openLocalNetworkSettings: "command:openLocalNetworkSettings",
} as const;

export type SnapshotPayload = DiscoverySnapshot;
export type DeltaPayload = DiscoveryDelta;
export type StatusPayload = DiscoveryStatus;
export type HealthPayload = DiscoveryHealth;
```

- [ ] **Step 2: Wire the main-process IPC**

In `src/main/ipc/registerDiscoveryIpc.ts`:

Add the import:

```ts
import { LocalNetworkHealthCheck } from "../discovery/permissionHealth";
```

Replace the `onEvent` handler to route the health event (it currently has a two-way `else`):

```ts
	const onEvent = (e: ManagerEvent): void => {
		if (e.type === "snapshot") push(IPC.snapshot, e.snapshot);
		else if (e.type === "delta") push(IPC.delta, e.delta);
		else if (e.type === "status") push(IPC.status, e.status);
		else push(IPC.health, e.health);
	};
```

Construct the manager with the darwin-gated health check:

```ts
	const manager = new DiscoveryManager({
		source: new BonjourSource(),
		onEvent,
		healthCheck: new LocalNetworkHealthCheck({ enabled: process.platform === "darwin" }),
	});
```

Register the Open-Settings deep-link handler alongside the other `ipcMain.handle` calls (after `IPC.openExternal`):

```ts
	ipcMain.handle(IPC.openLocalNetworkSettings, async () => {
		// macOS deep link to System Settings → Privacy & Security → Local Network.
		await shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork");
	});
```

Add the channel to the `closed` cleanup loop:

```ts
	win.on("closed", () => {
		manager.stop();
		for (const ch of [
			IPC.rescan,
			IPC.setLive,
			IPC.resolve,
			IPC.getSnapshot,
			IPC.openExternal,
			IPC.openLocalNetworkSettings,
		]) {
			ipcMain.removeHandler(ch);
		}
	});
```

- [ ] **Step 3: Expose the API in the preload**

In `src/preload/preload.ts`, update the payload import and the `beacon` object:

```ts
import type { DeltaPayload, HealthPayload, SnapshotPayload, StatusPayload } from "../shared/ipc";
```

```ts
const beacon: BeaconApi = {
	onSnapshot: (l) => subscribe<SnapshotPayload>(IPC.snapshot, l),
	onDelta: (l) => subscribe<DeltaPayload>(IPC.delta, l),
	onStatus: (l) => subscribe<StatusPayload>(IPC.status, l),
	onHealth: (l) => subscribe<HealthPayload>(IPC.health, l),
	rescan: () => ipcRenderer.invoke(IPC.rescan) as Promise<void>,
	setLive: (on) => ipcRenderer.invoke(IPC.setLive, on) as Promise<void>,
	resolve: (key) => ipcRenderer.invoke(IPC.resolve, key) as Promise<void>,
	getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<SnapshotPayload>,
	openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>,
	openLocalNetworkSettings: () => ipcRenderer.invoke(IPC.openLocalNetworkSettings) as Promise<void>,
};
```

- [ ] **Step 4: Extend the `BeaconApi` type**

In `src/shared/beacon-api.ts`:

```ts
import type { DeltaPayload, HealthPayload, SnapshotPayload, StatusPayload } from "./ipc";

export type Unsubscribe = () => void;

export interface BeaconApi {
	onSnapshot(listener: (s: SnapshotPayload) => void): Unsubscribe;
	onDelta(listener: (d: DeltaPayload) => void): Unsubscribe;
	onStatus(listener: (s: StatusPayload) => void): Unsubscribe;
	onHealth(listener: (h: HealthPayload) => void): Unsubscribe;
	rescan(): Promise<void>;
	setLive(on: boolean): Promise<void>;
	resolve(key: string): Promise<void>;
	getSnapshot(): Promise<SnapshotPayload>;
	openExternal(url: string): Promise<void>;
	openLocalNetworkSettings(): Promise<void>;
}
```

- [ ] **Step 5: Verify typecheck + full suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean (the contract is consistent across main/preload/renderer); all existing tests still pass. (Renderer tests build their `window.beacon` mock with `as unknown as typeof window.beacon`, so the two new methods do not break them.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/registerDiscoveryIpc.ts src/preload/preload.ts src/shared/beacon-api.ts
git commit -m "feat(ipc): expose permission health event + Open Local Network Settings command"
```

---

## Task 5: Renderer — permission banner + store wiring

**Files:**
- Modify: `src/renderer/store/discoveryStore.ts`
- Test: `src/renderer/store/discoveryStore.test.ts` (add cases)
- Create: `src/renderer/components/PermissionBanner.tsx`
- Create: `src/renderer/components/PermissionBanner.module.css`
- Test: `src/renderer/components/PermissionBanner.test.tsx`
- Modify: `src/renderer/main.tsx`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: `window.beacon.onHealth` and `window.beacon.openLocalNetworkSettings` (Task 4).
- Produces: `DiscoveryState` gains `permissionHint: boolean`, `showPermissionHint(): void`, `dismissPermissionHint(): void`.

- [ ] **Step 1: Write the failing store tests**

In `src/renderer/store/discoveryStore.test.ts`, add:

```ts
it("shows and dismisses the permission hint", () => {
	const store = useDiscoveryStore.getState();
	expect(useDiscoveryStore.getState().permissionHint).toBe(false);
	store.showPermissionHint();
	expect(useDiscoveryStore.getState().permissionHint).toBe(true);
	store.dismissPermissionHint();
	expect(useDiscoveryStore.getState().permissionHint).toBe(false);
});
```

(If the test file resets state between cases via `useDiscoveryStore.setState(...)` in a `beforeEach`, add `permissionHint: false` to that reset object so this case starts from a known state. If there is no such `beforeEach`, this case is self-contained as written.)

- [ ] **Step 2: Run the store test to verify it fails**

Run: `pnpm vitest run src/renderer/store/discoveryStore.test.ts`
Expected: FAIL — `showPermissionHint` / `permissionHint` do not exist.

- [ ] **Step 3: Add state + actions to the store**

In `src/renderer/store/discoveryStore.ts`, add to the `DiscoveryState` interface (near `toast`):

```ts
	permissionHint: boolean;
```

and to the actions list:

```ts
	showPermissionHint: () => void;
	dismissPermissionHint: () => void;
```

In the `create(...)` initial state, add after `toast: null,`:

```ts
	permissionHint: false,
```

Add the action implementations (next to `showToast`/`dismissToast`):

```ts
	showPermissionHint: () => set({ permissionHint: true }),
	dismissPermissionHint: () => set({ permissionHint: false }),
```

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm vitest run src/renderer/store/discoveryStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing banner component test**

Create `src/renderer/components/PermissionBanner.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { PermissionBanner } from "./PermissionBanner";

beforeEach(() => {
	window.beacon = {
		openLocalNetworkSettings: vi.fn().mockResolvedValue(undefined),
	} as unknown as typeof window.beacon;
	useDiscoveryStore.setState({ permissionHint: false });
});

describe("PermissionBanner", () => {
	it("renders nothing when there is no hint", () => {
		render(<PermissionBanner />);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("shows the hint, opens settings, and dismisses", () => {
		useDiscoveryStore.setState({ permissionHint: true });
		render(<PermissionBanner />);
		expect(screen.getByRole("alert")).toBeTruthy();

		fireEvent.click(screen.getByText("Open Settings"));
		expect(window.beacon.openLocalNetworkSettings).toHaveBeenCalled();

		fireEvent.click(screen.getByLabelText("Dismiss"));
		expect(useDiscoveryStore.getState().permissionHint).toBe(false);
	});
});
```

- [ ] **Step 6: Run the banner test to verify it fails**

Run: `pnpm vitest run src/renderer/components/PermissionBanner.test.tsx`
Expected: FAIL — cannot resolve `./PermissionBanner`.

- [ ] **Step 7: Implement the banner**

Create `src/renderer/components/PermissionBanner.tsx`:

```tsx
import { useDiscoveryStore } from "../store/discoveryStore";
import styles from "./PermissionBanner.module.css";

export function PermissionBanner() {
	const show = useDiscoveryStore((s) => s.permissionHint);
	const dismiss = useDiscoveryStore((s) => s.dismissPermissionHint);
	if (!show) return null;
	return (
		<div className={styles.banner} role="alert">
			<span className={styles.text}>
				No local-network responses yet. If devices are missing, Beacon may need Local Network access.
			</span>
			<button
				type="button"
				className={`${styles.action} bcn-no-drag`}
				onClick={() => void window.beacon.openLocalNetworkSettings()}
			>
				Open Settings
			</button>
			<button type="button" className={`${styles.close} bcn-no-drag`} aria-label="Dismiss" onClick={dismiss}>
				×
			</button>
		</div>
	);
}
```

Create `src/renderer/components/PermissionBanner.module.css` (bespoke amber treatment, consistent with `tokens.css`; fixed overlay below the 46px toolbar so it does not disturb the flex layout):

```css
.banner {
	position: fixed;
	top: 56px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 90;
	display: flex;
	align-items: center;
	gap: 12px;
	max-width: min(640px, calc(100vw - 32px));
	padding: 9px 10px 9px 14px;
	background: var(--surface-toolbar);
	border: 1px solid rgba(255, 197, 61, 0.45);
	border-radius: 9px;
	box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.55);
	font-size: 12.5px;
	animation: bcn-popin 0.16s ease;
}
.text {
	color: var(--gray-12);
	line-height: 1.35;
}
.action {
	flex: 0 0 auto;
	padding: 5px 11px;
	border: none;
	border-radius: 7px;
	background: rgba(255, 197, 61, 0.16);
	color: #ffc53d;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
}
.action:hover {
	background: rgba(255, 197, 61, 0.24);
}
.close {
	flex: 0 0 auto;
	width: 22px;
	height: 22px;
	display: flex;
	align-items: center;
	justify-content: center;
	border: none;
	border-radius: 6px;
	background: transparent;
	color: var(--gray-10);
	font-size: 16px;
	line-height: 1;
	cursor: pointer;
}
.close:hover {
	background: var(--gray-a4);
	color: var(--gray-12);
}
```

Note: `bcn-popin` is defined in `src/renderer/styles/tokens.css` and already includes the `translateX(-50%)` baseline used by the centered Toast, so the banner's `transform` and the keyframe agree.

- [ ] **Step 8: Run the banner test to verify it passes**

Run: `pnpm vitest run src/renderer/components/PermissionBanner.test.tsx`
Expected: PASS — 2 tests pass.

- [ ] **Step 9: Wire the event and render the banner**

In `src/renderer/main.tsx`, after the existing `window.beacon.onStatus(...)` subscription:

```ts
window.beacon.onHealth(() => store.showPermissionHint());
```

In `src/renderer/App.tsx`, import the banner and render it alongside `<Toast />`:

```tsx
import { PermissionBanner } from "./components/PermissionBanner";
```

```tsx
			<Toast />
			<PermissionBanner />
		</div>
```

- [ ] **Step 10: Verify typecheck + lint + full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean / all pass.

- [ ] **Step 11: Commit**

```bash
git add src/renderer/store/discoveryStore.ts src/renderer/store/discoveryStore.test.ts \
	src/renderer/components/PermissionBanner.tsx src/renderer/components/PermissionBanner.module.css \
	src/renderer/components/PermissionBanner.test.tsx src/renderer/main.tsx src/renderer/App.tsx
git commit -m "feat(ui): surface a dismissable Local Network permission banner"
```

---

## Task 6: Packaged-build smoke gate

**Files:**
- Modify: `src/main/main.ts` (startup marker)
- Create: `scripts/smoke-package.sh`

**Interfaces:** none (verification artifact). The marker line `[beacon] main process ready` is a deterministic, machine-independent signal: it prints from inside `app.whenReady()`, which only runs if every static `import` in the main module graph resolved — including the externalized `bonjour-service`. If the closure failed to ship, `main.js` aborts during module evaluation and the marker never prints.

**Why a marker rather than grepping discovery output:** discovery only logs when a transport errors (e.g. `[discovery] udp6 … EADDRNOTAVAIL` on this dev machine), which is machine-dependent. The `whenReady` marker is unconditional, so the smoke test is reliable on any macOS host.

- [ ] **Step 1: Add the startup marker**

In `src/main/main.ts`, add the marker as the first statement inside `app.whenReady().then(...)`:

```ts
app.whenReady().then(() => {
	console.log("[beacon] main process ready");
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
```

- [ ] **Step 2: Write the smoke script**

Create `scripts/smoke-package.sh`:

```bash
#!/usr/bin/env bash
# Packaged-build smoke gate (macOS). Proves the externalized bonjour-service closure ships
# and resolves from a RELOCATED .app (outside the source tree), and that the macOS Local
# Network Info.plist keys are present. This boots a GUI app for ~6s, so it is a local/manual
# gate (not headless CI). See Plan 4, Task 6.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "==> Packaging…"
pnpm package >/dev/null 2>&1 || fail "pnpm package errored"

APP="$(/bin/ls -d "$ROOT"/out/Beacon-darwin-*/Beacon.app 2>/dev/null | head -1)"
[ -n "$APP" ] && [ -d "$APP" ] || fail "no packaged .app under out/"
ASAR="$APP/Contents/Resources/app.asar"
PLIST="$APP/Contents/Info.plist"

echo "==> Asserting the dependency closure shipped into the asar…"
npx --no-install asar list "$ASAR" | grep -q "/node_modules/bonjour-service/package.json" \
	|| fail "bonjour-service missing from app.asar (closure not shipped)"

echo "==> Asserting the macOS Local Network Info.plist keys…"
/usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST" >/dev/null 2>&1 \
	|| fail "NSLocalNetworkUsageDescription missing from Info.plist"
BID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || true)"
[ "$BID" = "com.andyshinn.beacon" ] || fail "CFBundleIdentifier is '$BID', expected com.andyshinn.beacon"

echo "==> Booting a RELOCATED copy (outside the source tree)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$APP" "$TMP/"
LOG="$TMP/boot.log"
( cd "$TMP" && "./Beacon.app/Contents/MacOS/Beacon" >"$LOG" 2>&1 & echo $! >"$TMP/pid" )
sleep 6
kill "$(cat "$TMP/pid")" 2>/dev/null || true
grep -q "\[beacon\] main process ready" "$LOG" \
	|| fail "relocated app did not reach app.whenReady — externalized import likely failed to resolve"

echo "SMOKE PASS: closure ships + resolves from a relocated .app; Info.plist OK."
```

- [ ] **Step 3: Make it executable**

Run: `chmod +x scripts/smoke-package.sh`

- [ ] **Step 4: Run the full quality suite, then the smoke gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean / all pass.

Run: `bash scripts/smoke-package.sh`
Expected final line: `SMOKE PASS: closure ships + resolves from a relocated .app; Info.plist OK.`
(A short-lived Beacon window appears during the ~6s boot; this is expected.)

- [ ] **Step 5: Confirm makers build on the host platform**

Run: `pnpm make`
Expected: `Making a dmg distributable for darwin/<arch>` and `Making a zip distributable for darwin/<arch>` both succeed; artifacts appear under `out/make/` (e.g. `out/make/Beacon-0.1.0-arm64.dmg` and `out/make/zip/darwin/<arch>/Beacon-darwin-<arch>-0.1.0.zip`). The Windows (Squirrel) and Linux (deb/rpm) makers are correctly skipped on a macOS host — they build on their own native hosts/CI (unsigned, per GC-1).

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts scripts/smoke-package.sh
git commit -m "chore(packaging): startup marker + packaged-build smoke gate"
```

---

## Self-Review

Checked against the spec (§3.4 cross-platform notes, §8 manual matrix, §11 non-goals, §12 risks) and the verified packaging behavior:

- **Spec coverage:**
  - "Add `NSLocalNetworkUsageDescription` via forge `packagerConfig`" → Task 1 (`extendInfo`). Stable bundle id (TCC persistence) → Task 1 (`appBundleId`).
  - "Do not request `com.apple.developer.networking.multicast`" → honored (GC-4); no entitlements added.
  - "Startup health check … if the first sends yield EHOSTUNREACH or no responses within a few seconds" → Tasks 2–5 (timeout heuristic; EHOSTUNREACH path documented as not reliably catchable, GC-5).
  - "Must be tested via the packaged `.app`, not Terminal" (§12) → Task 6 boots a relocated `.app`.
  - "Unsigned local builds for mac/win/linux; defer signing/notarization/auto-update" (§11) → no signing config; makers unchanged; `pnpm make` verified on darwin.
  - The packaged-build ESM/externalize re-verification (the stated Plan 4 goal) → Task 6 proves the externalized `bonjour-service` resolves from inside `app.asar` in a relocated app.
- **Placeholder scan:** none — every step has concrete code/commands and the expected outputs are the ones observed while grounding this plan.
- **Type consistency:** `DiscoveryHealth` defined in Task 3 and consumed by `IPC`/`HealthPayload`/`BeaconApi` in Task 4. `HealthCheck` defined in Task 2, consumed by `DiscoveryManagerOptions` in Task 3 and constructed in Task 4. `permissionHint` / `showPermissionHint` / `dismissPermissionHint` named identically across store, test, component, and `main.tsx`. `IPC.openLocalNetworkSettings` and `onHealth` consistent across `ipc.ts`, `registerDiscoveryIpc.ts`, `preload.ts`, `beacon-api.ts`.
- **Decoupling note:** the `ignore` predicate is unit-tested in isolation (`scripts/packageIgnore.ts`), keeping `forge.config.ts` (config) thin; a relative TS import from `forge.config.ts` was verified to load under the Forge config loader.
