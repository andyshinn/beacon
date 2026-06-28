# Beacon — Full Renderer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Beacon's minimal placeholder renderer with the full prototype UI — four discovery lenses (Services, Hosts, Discovered IPs, All Instances), a selection-driven detail pane, a toolbar (live/pause, lens nav, search, rescan, view options, theme, export), a status bar, and toasts — driven by the live discovery store and Radix Themes tokens.

**Architecture:** The renderer is a Radix Themes app over the existing zustand discovery store. The store (Plan 1/2) holds the authoritative `hosts`/`instances` Maps fed by IPC snapshot/delta. Plan 3 adds **ephemeral UI state** (status, selection, search query, expanded set, paused-at, clock) to that store, a **persisted settings store** (appearance, active lens, sort, show-toggles), a library of **pure derivation functions** (`visibleInstances`, the four lens builders, `buildDetail`, presence/staleness helpers, export formatters), and the **component tree** (`Toolbar`, `ListPane` + four lenses, `DetailPane` + variants, `StatusBar`, `Toast`). The prototype's hardcoded `Component`/`DCLogic` runtime, its `SVC/HOSTS/INST` demo fixtures, and its scripted live timeline are **re-implemented against the real data model**, not copied.

**Tech Stack:** React 19, `@radix-ui/themes` ^3.3, zustand ^5 (+ `zustand/middleware` persist), Vite 8 (native CSS Modules), Vitest + `@testing-library/react` + happy-dom, Biome 2.5.

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the design spec (`docs/superpowers/specs/2026-06-27-beacon-mdns-browser-design.md`) and the prototype (`docs/design/mdns-discovery-electron-app/project/Beacon.dc.html` + `support.js`). When pixel/SVG detail is needed, the prototype file is in-repo — transcribe from the cited line, do not recreate from memory.

### GC-1 — Theming
- Wrap the app in `<Theme appearance={settings.appearance} accentColor="indigo" grayColor="slate" radius="medium">`. `appearance` defaults to `"dark"` and comes from the persisted settings store (no longer a literal in `main.tsx`).
- **Delete the prototype's hardcoded `:root` palette.** Inherit Radix CSS vars (`--gray-1..12`, `--gray-a1..a12`, `--accent-1..12`, `--accent-a1..a12`, `--accent-contrast`, `--radius-1..6`, `--default-font-family`, `--code-font-family`). Prototype colors were already the indigo/slate scales — map 1:1.
- **Four bespoke surface vars** (no clean Radix token — near-black flat surfaces) defined once in a global stylesheet `src/renderer/styles/tokens.css`:
  `--app-bg: #0d0d0f;` `--surface-panel: #161618;` `--surface-toolbar: #1e1e21;` `--surface-menu: #161618;` (the prototype's `--panel-2 #1a1a1d` sidebar/tabs surface is unused — segmented-only nav).
- **Density is fixed to "comfortable"** — define once: `--row-h: 30px;` `--list-fs: 13px;` `--row-pad: 10px;`. No compact/spacious variants.
- Mono text (IPs, service types, TXT, ports) uses `var(--code-font-family)`; body uses `var(--default-font-family)`.

### GC-2 — Window chrome & nav
- The Electron window **is** the app — drop the prototype's fake desktop backdrop, floating card, `border-radius:11px` window ring, `box-shadow`, and macOS traffic-light dots.
- macOS `titleBarStyle: 'hiddenInset'` is already set (Plan 2). The toolbar is a drag region: set `-webkit-app-region: drag` on the toolbar bar and `-webkit-app-region: no-drag` on every interactive control inside it. On macOS reserve space for the traffic lights with `padding-left: 76px` on the toolbar (apply via `platform === "darwin"`; expose `window.beacon` has no platform flag, so gate on `navigator.platform.startsWith("Mac")`).
- **Lens nav is `SegmentedControl` only.** Do not build the prototype's `sidebar` or `tabs` layouts (spec §11 non-goal).

### GC-3 — Data-model translation (CRITICAL)
The prototype's demo shapes differ from the real shipped model. Re-implement behavior against the **real** types in `src/shared/types.ts`. Map every prototype field as follows — implementers MUST use the real field names:

| Prototype (demo) | Real model | Notes |
|---|---|---|
| `inst.id` (`"i0"`) | `Instance.key` (lowercased fqdn) | selection id for `kind:"inst"` |
| `inst.name` | `Instance.name` | |
| `inst.svc` | `Instance.serviceType` (`"_airplay._tcp"`) | |
| `inst.proto` | `Instance.protocol` (`"tcp"|"udp"`) | |
| `inst.port` | `Instance.port` (0 = no port) | |
| `inst.txt` | `Instance.txt` (`Record<string,string>`) | TXT detail also uses `Instance.rawTxt` |
| `inst.hostId` / `inst.host` | `Instance.hostId` → `hosts.get(hostId)` | host is looked up, not embedded |
| `host.id` | `Host.id` (lowercased hostname) | selection id for `kind:"host"` |
| `host.name` | `Host.displayName` | |
| `host.hostname` | `Host.hostname` | |
| `host.addrs` `[{ip,type}]` | `Host.addresses` `[{value,family,zone?}]` | family values identical: `"ipv4"|"ipv6"|"linklocal"|"loopback"` |
| `host.live` (scripted) | derive from `Host.present` | |
| service-type `meta` (`SVC[...]`) | static `SERVICE_META` map shipped in `lib/serviceTypes.ts` | desc + proto; proto also on instance |

- Selection id formats: `inst` → `Instance.key`; `host` → `Host.id`; `svc` → the `serviceType` string; `ip` → `` `${hostId}|${addressValue}` `` (address value WITHOUT zone).
- `primaryIp(host)`: sort `host.addresses` by family order `ipv4(0) < ipv6(1) < linklocal(2) < loopback(3)`, return the winner's `.value` (zone dropped), or `null`. This is the existing store helper — **move it verbatim to `lib/presence.ts`**; the store's private copy is deleted along with `rows` (Task 3), and `selectors`/`detail`/`commands` import it from `lib/presence` (DRY, single source).

### GC-4 — Presence & staleness derive from REAL fields (drop the scripted timeline)
The prototype faked `events.homepodJoined`/`kitchenLeft`. The real engine sets `present`/`departedAt`/`firstSeen`/`lastSeen` (see `src/main/discovery/store.ts`). Derivations (in `lib/presence.ts`):
- `NEW_WINDOW_MS = 6000`, `AGING_AGE_S = 5`, `STALE_AGE_S = 12`.
- `isNew(inst, now)` = `inst.present && now - inst.firstSeen < NEW_WINDOW_MS` → green **NEW** badge.
- `isLeft(inst)` = `!inst.present` → gray **LEFT** badge (instance stays visible until main prunes it via `removeInstanceKeys`).
- Instance status: `present` → "Live"; else "Offline". Host status: `host.present` → "Online"; else "Offline".
- "Last seen": `relativeLastSeen(lastSeen, now, present)` → `present` ⇒ `"just now"`; else `` `${Math.round((now-lastSeen)/1000)}s ago` `` (clamped ≥1).
- **The renderer never prunes** — main owns the ~30s prune (`DiscoveryManager.pruneGraceMs`). Removal arrives as a delta.

### GC-5 — Live / pause / scanning come from `onStatus`
- `window.beacon.onStatus({live,scanning})` is the authoritative engine state → `store.status`. Wire it in `main.tsx` (currently unwired).
- The toolbar/status-bar **live ⇄ paused ⇄ stale** tint is renderer-derived: when `status.live` flips `true→false`, record `pausedAt = store.now`; when `true`, `pausedAt = 0`. `pausedAgeS = live ? 0 : floor((now - pausedAt)/1000)`. `staleness(live, pausedAgeS)` = `live ? "fresh" : pausedAgeS >= STALE_AGE_S ? "stale" : pausedAgeS >= AGING_AGE_S ? "aging" : "fresh"`. Applied as `data-staleness` on the app shell; CSS dims `.scroll` panels (`aging` `opacity:.72`; `stale` `opacity:.5; filter:grayscale(.4)`; transition `opacity .8s, filter .8s`).
- A single 1s interval (in `main.tsx`) calls `store.tick(Date.now())` to advance `now` (drives NEW expiry + staleness). `pausedAt`/`now` use the store's injected clock, never `Date.now()` inside reducers (test determinism).
- Pause = `window.beacon.setLive(false)` (stops engines, main emits `live:false`). Resume/rescan force live. Pausing changes **no data**.

### GC-6 — Commands & side effects
- Toggle live: `window.beacon.setLive(next)`. Rescan: `window.beacon.rescan()`. Resolve: `window.beacon.resolve(Instance.key)` + toast `` `Resolved ${hostname} → ${primaryIp}` ``. Open in browser: `window.beacon.openExternal(url)` (NOT `window.open`) + toast `` `Opening ${url}` ``.
- Copy: `navigator.clipboard.writeText(text)` then toast `` `Copied ${trunc(label)}` ``. `trunc(s)` = `s.length > 44 ? s.slice(0,42)+"…" : s`. Toast lifetime **1900ms**, single timer reset on each new toast.
- Web service types (open-in-browser): instance detail set = `{_http._tcp, _hue._tcp, _prusalink._tcp, _home-assistant._tcp}`, scheme `https` only for `_hue._tcp` else `http`; host/ip detail set = `{_http._tcp, _home-assistant._tcp}` (scheme always `http`). URL = `` `${scheme}://${primaryIp}${port>0?`:${port}`:""}` ``.

### GC-7 — Search, toggles, sort, export
- Search: single normalized query `q = search.trim().toLowerCase()`, case-insensitive substring (`.includes`), no regex/tokenizing. `visibleInstances` keeps an instance if `q` is empty OR any of: `name`, `serviceType`, host `displayName`, host `hostname`, any host address `value`, or any TXT `` `${k}=${v}` `` contains `q`. When `q` is non-empty, all tree groups force-expand.
- Show toggles gate addresses via `addrAllowed(family, settings)`: `ipv6` hidden when `!showV6`; `linklocal` hidden when `!showLinkLocal`; `ipv4`/`loopback` always shown. Applies to the IPs lens, detail address sections, and the IP count. `showDesc` gates the service-tree group subtitle and the instance-detail service description (the **service-type** detail always shows its description).
- Sort (`sortBy`) affects ONLY the All-Instances lens: `name` → name then serviceType; `ip` → `cmpIp(primaryIp)` then name; `lastseen` → present-first then name.
- Export actually serializes (the prototype only toasted). Source rows = `visibleInstances`. `lib/export.ts` provides `toJSON`, `toCSV`, `toText`; JSON/CSV trigger a download (`triggerDownload(filename, mime, text)` via a Blob + anchor), TXT copies to clipboard. See Task 2 for exact columns. Toast `` `Exported ${n} records as JSON` `` / `…CSV`; TXT toasts `Copied snapshot`.

### GC-8 — Keyboard (document keydown)
`Cmd/Ctrl+K` or `/` (when not typing in input/textarea) → focus search; `Esc` while typing → blur + clear search if non-empty; ignore other modifier combos; `Space` or `p` → toggle live (but `Space` on a `BUTTON`/`A` target is ignored); `r` → rescan; `1`→Services, `2`→Hosts, `3`→Discovered IPs, `4`→All Instances.

### GC-9 — Persistence
Persist (zustand `persist`) **only** UI settings: `appearance`, `mode` (active lens), `sortBy`, `showDesc`, `showV6`, `showLinkLocal`. Never persist discovery data, selection, search, expanded, or live state. Use a **separate** `useSettingsStore` so the data store keeps its non-serializable `Map`/`Set` state out of persistence.

### GC-10 — Code style
Match the codebase: Biome (tab indent, double quotes, `lineWidth` 125). Run `pnpm typecheck` + `pnpm lint` + `pnpm test` green before each commit. Components are function components; CSS Modules co-located as `Name.module.css`. No `any`. Prefer small focused files.

## File Structure

```
src/renderer/
  main.tsx                     MODIFY  — wire onStatus, getSnapshot bootstrap, settings-driven Theme, 1s clock, keyboard
  App.tsx                      REWRITE — Theme child: shell (Toolbar/Body/StatusBar/Toast) + data-staleness
  styles/
    tokens.css                 NEW     — surface + density vars, keyframes, custom scrollbar, .scroll staleness
  store/
    discoveryStore.ts          MODIFY  — + status/selection/query/expanded/pausedAt/now/toast + actions + command thunks
    settingsStore.ts           NEW     — persisted UI settings (appearance/mode/sortBy/showDesc/showV6/showLinkLocal)
  lib/
    serviceTypes.ts            NEW     — SERVICE_META map + web-type sets + webScheme + webUrl
    presence.ts                NEW     — primaryIp, isNew, isLeft, cmpIp, trunc, staleness, ageLabel, relativeLastSeen, addrAllowed
    selectors.ts               NEW     — visibleInstances, lensCounts, buildServiceTree, buildHostTree, buildIpGroups, buildFlat
    detail.ts                  NEW     — buildDetail (inst/host/svc/ip) + addrGroups
    export.ts                  NEW     — toJSON, toCSV, toText, triggerDownload
    icons.tsx                  NEW     — all inline-SVG icon components (transcribed from prototype)
  components/
    Toolbar.tsx                NEW
    Toolbar.module.css         NEW
    LiveToggle.tsx             NEW     (+ .module.css)
    SearchField.tsx            NEW
    ViewMenu.tsx               NEW
    ExportMenu.tsx             NEW
    ListPane.tsx               NEW     (+ .module.css)  — header + scroll + lens router
    lenses/ServicesLens.tsx    NEW
    lenses/HostsLens.tsx       NEW
    lenses/IpsLens.tsx         NEW     (+ Ips.module.css)
    lenses/AllLens.tsx         NEW
    rows/TreeRows.tsx          NEW     (+ Rows.module.css)  — TreeGroupRow, TreeChildRow, Badges, chips
    rows/FlatRow.tsx           NEW
    DetailPane.tsx             NEW     (+ Detail.module.css) — router + EmptyDetail + sections
    detail/InstanceDetail.tsx  NEW
    detail/HostDetail.tsx      NEW
    detail/ServiceTypeDetail.tsx NEW
    detail/IpDetail.tsx        NEW
    detail/sections.tsx        NEW     — Header, ActionButtons, AddressBlock, MetaTable, ServicesList, HostsList, TxtTable
    StatusBar.tsx              NEW     (+ .module.css)
    Toast.tsx                  NEW     (+ .module.css)
  lib/keyboard.ts              NEW     — installKeyboard(handlers): () => void
tests live beside sources as `*.test.ts(x)`.
```

---

### Task 1: Global tokens + app shell layout

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Create/Rewrite: `src/renderer/App.tsx`
- Modify: `src/renderer/main.tsx` (add `import "./styles/tokens.css";` after the Radix styles import)
- Test: `src/renderer/App.test.tsx` (rewrite)

**Interfaces:**
- Produces: `App` (default-exported-as-named `export function App()`), the shell DOM landmarks with global class names `bcn-app` (carries `data-staleness`), `bcn-toolbar`, `bcn-body`, `bcn-list-pane`, `bcn-detail-pane`, `bcn-status-bar`, and the utility class `bcn-scroll` for dimmable scroll panels. Later tasks render real `<Toolbar/>`, `<ListPane/>`, `<DetailPane/>`, `<StatusBar/>`, `<Toast/>` into these slots.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/App.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
	it("renders the toolbar, list pane, detail pane, and status bar landmarks", () => {
		const { container } = render(<App />);
		expect(container.querySelector(".bcn-app")).toBeTruthy();
		expect(container.querySelector(".bcn-toolbar")).toBeTruthy();
		expect(container.querySelector(".bcn-list-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-detail-pane")).toBeTruthy();
		expect(container.querySelector(".bcn-status-bar")).toBeTruthy();
		expect(screen.getByText("Beacon")).toBeTruthy();
	});

	it("defaults the staleness attribute to fresh", () => {
		const { container } = render(<App />);
		expect(container.querySelector(".bcn-app")?.getAttribute("data-staleness")).toBe("fresh");
	});
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run src/renderer/App.test.tsx`
Expected: FAIL (current `App` renders the placeholder list, no `bcn-*` classes).

- [ ] **Step 3: Write `src/renderer/styles/tokens.css`**

```css
/* Bespoke surfaces (no clean Radix token) + fixed "comfortable" density. */
:root {
	--app-bg: #0d0d0f;
	--surface-panel: #161618;
	--surface-toolbar: #1e1e21;
	--surface-menu: #161618;
	--row-h: 30px;
	--list-fs: 13px;
	--row-pad: 10px;
}

.bcn-app {
	display: flex;
	flex-direction: column;
	height: 100vh;
	overflow: hidden;
	background: var(--app-bg);
	color: var(--gray-12);
	font-size: var(--list-fs);
}

.bcn-toolbar {
	flex: 0 0 auto;
	height: 46px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 12px;
	background: var(--surface-toolbar);
	border-bottom: 1px solid var(--gray-a6);
	-webkit-app-region: drag;
}
.bcn-app[data-platform="mac"] .bcn-toolbar {
	padding-left: 76px;
}
.bcn-toolbar button,
.bcn-toolbar input,
.bcn-toolbar a,
.bcn-toolbar [role="combobox"],
.bcn-no-drag {
	-webkit-app-region: no-drag;
}

.bcn-body {
	flex: 1;
	display: flex;
	min-height: 0;
}
.bcn-list-pane {
	flex: 0 0 384px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	background: var(--surface-panel);
	border-right: 1px solid var(--gray-a6);
}
.bcn-detail-pane {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	background: var(--app-bg);
}
.bcn-status-bar {
	flex: 0 0 auto;
	height: 28px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 14px;
	background: var(--surface-toolbar);
	border-top: 1px solid var(--gray-a6);
	font-size: 11.5px;
	color: var(--gray-10);
}

.bcn-logo {
	width: 18px;
	height: 18px;
	border-radius: 6px;
	background: var(--accent-9);
	display: flex;
	align-items: center;
	justify-content: center;
}
.bcn-logo::after {
	content: "";
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
}
.bcn-title {
	font-weight: 650;
	font-size: 13.5px;
	letter-spacing: 0.01em;
}

/* Dimmable scroll panels (staleness tint). */
.bcn-scroll {
	flex: 1;
	overflow-y: auto;
	transition: opacity 0.8s, filter 0.8s;
}
.bcn-app[data-staleness="aging"] .bcn-scroll {
	opacity: 0.72;
}
.bcn-app[data-staleness="stale"] .bcn-scroll {
	opacity: 0.5;
	filter: grayscale(0.4);
}
.bcn-scroll::-webkit-scrollbar {
	width: 11px;
}
.bcn-scroll::-webkit-scrollbar-thumb {
	background: var(--gray-a6);
	border-radius: 8px;
	border: 3px solid transparent;
	background-clip: padding-box;
}
.bcn-scroll::-webkit-scrollbar-thumb:hover {
	background: var(--gray-a8);
	border: 3px solid transparent;
	background-clip: padding-box;
}

@keyframes bcn-liveplus {
	0% { box-shadow: 0 0 0 0 var(--green-a3); }
	70% { box-shadow: 0 0 0 5px transparent; }
	100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes bcn-amberpulse {
	0% { box-shadow: 0 0 0 0 rgba(255, 197, 61, 0.35); }
	70% { box-shadow: 0 0 0 5px transparent; }
	100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes bcn-spin {
	to { transform: rotate(360deg); }
}
@keyframes bcn-popin {
	from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.96); }
	to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes bcn-menuin {
	from { opacity: 0; transform: translateY(-4px) scale(0.98); }
	to { opacity: 1; transform: translateY(0) scale(1); }
}
```

- [ ] **Step 4: Write `src/renderer/App.tsx`**

```tsx
export function App() {
	const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
	return (
		<div className="bcn-app" data-staleness="fresh" data-platform={isMac ? "mac" : undefined}>
			<header className="bcn-toolbar">
				<div className="bcn-logo" />
				<span className="bcn-title" title="mDNS / Bonjour browser">
					Beacon
				</span>
			</header>
			<div className="bcn-body">
				<section className="bcn-list-pane" />
				<section className="bcn-detail-pane" />
			</div>
			<footer className="bcn-status-bar" />
		</div>
	);
}
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/styles/tokens.css src/renderer/main.tsx
git commit -m "feat(ui): app shell layout + global tokens"
```

---

### Task 2: Shared library — service metadata, presence/IP helpers, export, icons

**Files:**
- Create: `src/renderer/lib/serviceTypes.ts`, `src/renderer/lib/presence.ts`, `src/renderer/lib/export.ts`, `src/renderer/lib/icons.tsx`
- Test: `src/renderer/lib/serviceTypes.test.ts`, `src/renderer/lib/presence.test.ts`, `src/renderer/lib/export.test.ts`, `src/renderer/lib/icons.test.tsx`

**Interfaces:**
- Produces (consumed by Tasks 3–12):
  - `serviceTypes.ts`: `interface ServiceMeta { desc: string; proto: "tcp" | "udp" }`; `serviceMeta(type: string): ServiceMeta`; `INSTANCE_WEB_TYPES: Set<string>`; `HOST_WEB_TYPES: Set<string>`; `webScheme(type: string): "http" | "https"`; `webUrl(type: string, ip: string | null, port: number): string | null`.
  - `presence.ts`: `NEW_WINDOW_MS`, `AGING_AGE_S`, `STALE_AGE_S` consts; `primaryIp(host: Host | undefined): string | null`; `isNew(inst: Instance, now: number): boolean`; `isLeft(inst: Instance): boolean`; `cmpIp(a: string | null, b: string | null): number`; `trunc(s: string): string`; `type Staleness = "fresh" | "aging" | "stale"`; `staleness(live: boolean, pausedAgeS: number): Staleness`; `ageLabel(seconds: number): string`; `relativeLastSeen(lastSeen: number, now: number, present: boolean): string`; `interface ShowToggles { showV6: boolean; showLinkLocal: boolean }`; `addrAllowed(family: AddrFamily, t: ShowToggles): boolean`.
  - `export.ts`: `toJSON(instances: Instance[], hosts: Map<string, Host>): string`; `toCSV(...): string`; `toText(...): string`; `triggerDownload(filename: string, mime: string, text: string): void`.
  - `icons.tsx`: one named `() => JSX.Element` per icon (see table below).
- Consumes: `Host`, `Instance`, `Address`, `AddrFamily` from `src/shared/types`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/lib/presence.test.ts
import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { addrAllowed, ageLabel, cmpIp, isLeft, isNew, primaryIp, relativeLastSeen, staleness, trunc } from "./presence";

function host(addrs: Host["addresses"]): Host {
	return { id: "h", displayName: "H", hostname: "H.local.", addresses: addrs, firstSeen: 0, lastSeen: 0, present: true };
}
function inst(over: Partial<Instance>): Instance {
	return { key: "k", name: "n", serviceType: "_x._tcp", protocol: "tcp", port: 0, txt: {}, hostId: "h", firstSeen: 0, lastSeen: 0, present: true, ...over };
}

describe("primaryIp", () => {
	it("prefers ipv4 over other families and drops zone", () => {
		expect(primaryIp(host([{ value: "fe80::1", family: "linklocal", zone: "en0" }, { value: "10.0.0.2", family: "ipv4" }]))).toBe("10.0.0.2");
	});
	it("returns null for no addresses", () => {
		expect(primaryIp(host([]))).toBeNull();
		expect(primaryIp(undefined)).toBeNull();
	});
});

describe("isNew / isLeft", () => {
	it("isNew is true only while present and within the NEW window", () => {
		expect(isNew(inst({ firstSeen: 1000 }), 3000)).toBe(true);
		expect(isNew(inst({ firstSeen: 1000 }), 9000)).toBe(false);
		expect(isNew(inst({ firstSeen: 1000, present: false }), 3000)).toBe(false);
	});
	it("isLeft tracks absence", () => {
		expect(isLeft(inst({ present: false }))).toBe(true);
		expect(isLeft(inst({ present: true }))).toBe(false);
	});
});

describe("cmpIp", () => {
	it("orders dotted-quad numerically, nulls last", () => {
		expect(cmpIp("10.0.0.2", "10.0.0.10")).toBeLessThan(0);
		expect(cmpIp(null, "10.0.0.1")).toBeGreaterThan(0);
		expect(cmpIp("a::1", "b::1")).toBeLessThan(0);
	});
});

describe("staleness / ageLabel / trunc / relativeLastSeen / addrAllowed", () => {
	it("derives staleness from live + paused age", () => {
		expect(staleness(true, 99)).toBe("fresh");
		expect(staleness(false, 3)).toBe("fresh");
		expect(staleness(false, 5)).toBe("aging");
		expect(staleness(false, 12)).toBe("stale");
	});
	it("formats age as m:ss", () => {
		expect(ageLabel(9)).toBe("0:09");
		expect(ageLabel(75)).toBe("1:15");
	});
	it("truncates long labels at 44 chars", () => {
		expect(trunc("x".repeat(50))).toBe(`${"x".repeat(42)}…`);
		expect(trunc("short")).toBe("short");
	});
	it("formats last seen relative to now", () => {
		expect(relativeLastSeen(0, 0, true)).toBe("just now");
		expect(relativeLastSeen(1000, 5000, false)).toBe("4s ago");
	});
	it("gates families by show-toggles", () => {
		expect(addrAllowed("ipv4", { showV6: false, showLinkLocal: false })).toBe(true);
		expect(addrAllowed("loopback", { showV6: false, showLinkLocal: false })).toBe(true);
		expect(addrAllowed("ipv6", { showV6: false, showLinkLocal: true })).toBe(false);
		expect(addrAllowed("linklocal", { showV6: true, showLinkLocal: false })).toBe(false);
	});
});
```

```ts
// src/renderer/lib/serviceTypes.test.ts
import { describe, expect, it } from "vitest";
import { HOST_WEB_TYPES, INSTANCE_WEB_TYPES, serviceMeta, webScheme, webUrl } from "./serviceTypes";

describe("serviceMeta", () => {
	it("returns metadata for known types", () => {
		expect(serviceMeta("_hap._tcp").desc).toBe("HomeKit Accessory Protocol");
		expect(serviceMeta("_meshcop._udp").proto).toBe("udp");
	});
	it("defaults unknown types to empty desc + tcp", () => {
		expect(serviceMeta("_nope._tcp")).toEqual({ desc: "", proto: "tcp" });
	});
});

describe("web types + url", () => {
	it("uses https only for hue and includes the port", () => {
		expect(webScheme("_hue._tcp")).toBe("https");
		expect(webScheme("_http._tcp")).toBe("http");
		expect(webUrl("_http._tcp", "10.0.0.5", 8080)).toBe("http://10.0.0.5:8080");
		expect(webUrl("_hue._tcp", "10.0.0.5", 0)).toBe("https://10.0.0.5");
		expect(webUrl("_http._tcp", null, 80)).toBeNull();
	});
	it("scopes web sets per detail kind", () => {
		expect(INSTANCE_WEB_TYPES.has("_prusalink._tcp")).toBe(true);
		expect(HOST_WEB_TYPES.has("_prusalink._tcp")).toBe(false);
		expect(HOST_WEB_TYPES.has("_home-assistant._tcp")).toBe(true);
	});
});
```

```ts
// src/renderer/lib/export.test.ts
import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { toCSV, toJSON, toText } from "./export";

const hosts = new Map<string, Host>([
	["h", { id: "h", displayName: "Mac", hostname: "Mac.local.", addresses: [{ value: "10.0.0.2", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true }],
]);
const instances: Instance[] = [
	{ key: "k", name: "Mac", serviceType: "_ssh._tcp", protocol: "tcp", port: 22, txt: { a: "b" }, hostId: "h", firstSeen: 0, lastSeen: 0, present: true },
];

describe("export formatters", () => {
	it("toJSON emits one record per instance with host fields", () => {
		const rows = JSON.parse(toJSON(instances, hosts));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: "Mac", serviceType: "_ssh._tcp", port: 22, hostname: "Mac.local.", primaryIp: "10.0.0.2", present: true });
		expect(rows[0].txt).toEqual({ a: "b" });
	});
	it("toCSV has a header row and quotes fields", () => {
		const lines = toCSV(instances, hosts).split("\n");
		expect(lines[0]).toBe("name,serviceType,protocol,port,host,hostname,primaryIp,addresses,present,txt");
		expect(lines[1]).toContain('"Mac"');
		expect(lines[1]).toContain('"_ssh._tcp"');
		expect(lines[1]).toContain('"a=b"');
	});
	it("toText lists name, type, and endpoint", () => {
		expect(toText(instances, hosts)).toContain("Mac  _ssh._tcp  10.0.0.2:22");
	});
});
```

```tsx
// src/renderer/lib/icons.test.tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

describe("icons", () => {
	it("every export renders an <svg>", () => {
		for (const [name, Icon] of Object.entries(icons)) {
			if (typeof Icon !== "function") continue;
			const { container } = render(<Icon />);
			expect(container.querySelector("svg"), name).toBeTruthy();
		}
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/lib`
Expected: FAIL (modules do not exist).

- [ ] **Step 3: Implement `src/renderer/lib/serviceTypes.ts`**

```ts
export interface ServiceMeta {
	desc: string;
	proto: "tcp" | "udp";
}

// Static metadata for known mDNS service types (prototype SVC map). proto is also
// carried on each Instance; desc is UI-only and lives here.
export const SERVICE_META: Record<string, ServiceMeta> = {
	"_airplay._tcp": { desc: "Protocol for streaming of audio/video content", proto: "tcp" },
	"_raop._tcp": { desc: "Remote Audio Output Protocol — AirPlay audio", proto: "tcp" },
	"_companion-link._tcp": { desc: "Apple device companion linking", proto: "tcp" },
	"_coresense-ws._tcp": { desc: "Coresense WebSocket service", proto: "tcp" },
	"_device-info._tcp": { desc: "Device Info", proto: "tcp" },
	"_hap._tcp": { desc: "HomeKit Accessory Protocol", proto: "tcp" },
	"_home-assistant._tcp": { desc: "Home Assistant", proto: "tcp" },
	"_http._tcp": { desc: "World Wide Web HTTP", proto: "tcp" },
	"_hue._tcp": { desc: "Philips Hue protocol", proto: "tcp" },
	"_matter._tcp": { desc: "Matter Operational Discovery and Communication", proto: "tcp" },
	"_meshcop._udp": { desc: "Thread Mesh Commissioning", proto: "udp" },
	"_meshcore._tcp": { desc: "MeshCore networking", proto: "tcp" },
	"_ssh._tcp": { desc: "SSH Remote Login", proto: "tcp" },
	"_prusalink._tcp": { desc: "PrusaLink 3D printer", proto: "tcp" },
	"_spotify-connect._tcp": { desc: "Spotify Connect", proto: "tcp" },
};

export function serviceMeta(type: string): ServiceMeta {
	return SERVICE_META[type] ?? { desc: "", proto: "tcp" };
}

export const INSTANCE_WEB_TYPES = new Set(["_http._tcp", "_hue._tcp", "_prusalink._tcp", "_home-assistant._tcp"]);
export const HOST_WEB_TYPES = new Set(["_http._tcp", "_home-assistant._tcp"]);

export function webScheme(type: string): "http" | "https" {
	return type === "_hue._tcp" ? "https" : "http";
}

export function webUrl(type: string, ip: string | null, port: number): string | null {
	if (!ip) return null;
	return `${webScheme(type)}://${ip}${port > 0 ? `:${port}` : ""}`;
}
```

- [ ] **Step 4: Implement `src/renderer/lib/presence.ts`**

```ts
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
```

- [ ] **Step 5: Implement `src/renderer/lib/export.ts`**

```ts
import type { Host, Instance } from "../../shared/types";
import { primaryIp } from "./presence";

interface ExportRow {
	name: string;
	serviceType: string;
	protocol: string;
	port: number;
	host: string;
	hostname: string;
	primaryIp: string | null;
	addresses: string[];
	present: boolean;
	txt: Record<string, string>;
}

function toRows(instances: Instance[], hosts: Map<string, Host>): ExportRow[] {
	return instances.map((i) => {
		const h = hosts.get(i.hostId);
		return {
			name: i.name,
			serviceType: i.serviceType,
			protocol: i.protocol,
			port: i.port,
			host: h?.displayName ?? "",
			hostname: h?.hostname ?? "",
			primaryIp: primaryIp(h),
			addresses: (h?.addresses ?? []).map((a) => a.value),
			present: i.present,
			txt: i.txt,
		};
	});
}

export function toJSON(instances: Instance[], hosts: Map<string, Host>): string {
	return JSON.stringify(toRows(instances, hosts), null, 2);
}

const COLUMNS = ["name", "serviceType", "protocol", "port", "host", "hostname", "primaryIp", "addresses", "present", "txt"] as const;

function csvCell(v: string): string {
	return `"${v.replace(/"/g, '""')}"`;
}

export function toCSV(instances: Instance[], hosts: Map<string, Host>): string {
	const header = COLUMNS.join(",");
	const lines = toRows(instances, hosts).map((r) =>
		[
			r.name,
			r.serviceType,
			r.protocol,
			String(r.port),
			r.host,
			r.hostname,
			r.primaryIp ?? "",
			r.addresses.join(";"),
			String(r.present),
			Object.entries(r.txt)
				.map(([k, v]) => `${k}=${v}`)
				.join(";"),
		]
			.map(csvCell)
			.join(","),
	);
	return [header, ...lines].join("\n");
}

export function toText(instances: Instance[], hosts: Map<string, Host>): string {
	return toRows(instances, hosts)
		.map((r) => `${r.name}  ${r.serviceType}  ${r.primaryIp ?? "—"}${r.port > 0 ? `:${r.port}` : ""}`)
		.join("\n");
}

export function triggerDownload(filename: string, mime: string, text: string): void {
	const blob = new Blob([text], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: Implement `src/renderer/lib/icons.tsx`**

Each icon is a function component returning the prototype's exact inline `<svg>`. **Transcribe the paths/shapes verbatim** from the cited line in `docs/design/mdns-discovery-electron-app/project/Beacon.dc.html` (icons produced in JS — `extIcon/revealIcon/resolveIcon/copyIcon` — are near lines 718–721 of that file). Keep `fill="none" stroke="currentColor"` (or the prototype's exact attributes) so color flows from the parent. Pattern:

```tsx
import type { JSX } from "react";

type IconProps = { size?: number; className?: string };

// Example — transcribe the real <path> from Beacon.dc.html:105.
export function Search({ size = 14, className }: IconProps): JSX.Element {
	return (
		<svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" className={className} aria-hidden>
			{/* VERBATIM contents of the search icon svg from Beacon.dc.html */}
		</svg>
	);
}
```

Export one component per row (use the default `size`/`viewBox` shown). Source lines are in `Beacon.dc.html`:

| Export | size / viewBox | Source line |
|---|---|---|
| `PauseBars` | 11 / `0 0 11 11` | 86 |
| `PlayTriangle` | 11 / `0 0 11 11` | 87 |
| `Search` | 14 / `0 0 14 14` | 105 |
| `ClearX` | 13 / `0 0 13 13` | 108 |
| `Refresh` | 15 / `0 0 15 15` | 114 |
| `ViewOptions` | 15 / `0 0 15 15` | 121 |
| `Check` | 13 / `0 0 13 13` | 128 |
| `Sun` | 15 / `0 0 15 15` | 149 |
| `Moon` | 15 / `0 0 15 15` | 150 |
| `Download` | 13 / `0 0 13 13` | 156 |
| `ModeService` | 16 / `0 0 16 16` | 197 |
| `ModeHost` | 16 / `0 0 16 16` | 198 |
| `ModeIp` | 16 / `0 0 16 16` | 199 |
| `ModeAll` | 16 / `0 0 16 16` | 200 |
| `ExpandAll` | 14 / `0 0 14 14` | 228 |
| `CollapseAll` | 14 / `0 0 14 14` | 229 |
| `DisclosureDown` | 11 / `0 0 11 11` | 242 |
| `DisclosureRight` | 11 / `0 0 11 11` | 243 |
| `Copy` | 13 / `0 0 13 13` | 296 |
| `ModeInstance` | 16 / `0 0 16 16` | 341 |
| `ChevronRight` | 12 / `0 0 12 12` | 429 |
| `Radar` | 40 / `0 0 40 40` | 329 |
| `ToastCheck` | 14 / `0 0 14 14` | 501 |
| `ExtLink` | 13 / `0 0 13 13` | 719 |
| `RevealHost` | 13 / `0 0 13 13` | 720 |
| `Resolve` | 13 / `0 0 13 13` | 721 |

- [ ] **Step 7: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/lib && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/lib
git commit -m "feat(ui): service metadata, presence/ip helpers, export formatters, icons"
```

---

### Task 3: Store extension + persisted settings store

**Files:**
- Modify: `src/renderer/store/discoveryStore.ts` (add UI state + actions; drop the old `rows`/`InstanceRow`/`selectRows`/`buildRows`/local `primaryIp` — import `primaryIp` from `lib/presence`)
- Modify: `src/renderer/store/discoveryStore.test.ts` (replace `rows` tests with the new actions)
- Create: `src/renderer/store/settingsStore.ts`
- Test: `src/renderer/store/settingsStore.test.ts`

**Interfaces:**
- Produces:
  - `discoveryStore`: `type SelectionKind = "inst" | "host" | "svc" | "ip"`; `interface Selection { kind: SelectionKind; id: string }`; `useDiscoveryStore` with state `{ hosts: Map<string,Host>; instances: Map<string,Instance>; status: DiscoveryStatus; selection: Selection | null; query: string; expanded: Set<string>; pausedAt: number; now: number; toast: string | null }` and actions `applySnapshot, applyDelta, applyStatus, tick(now), selectInst(id), selectSvc(id), selectHost(id), selectIp(id), toggleExpand(id), expandAll(ids), collapseAll(), setQuery(q), clearSearch(), showToast(msg), dismissToast()`.
  - `settingsStore`: `type Lens = "service" | "host" | "ip" | "all"`; `type SortBy = "name" | "ip" | "lastseen"`; `type Appearance = "dark" | "light"`; `useSettingsStore` with `{ appearance, mode, sortBy, showDesc, showV6, showLinkLocal }` + `setAppearance, toggleAppearance, setMode, setSortBy, toggleShowDesc, toggleShowV6, toggleShowLinkLocal`.
- Consumes: `primaryIp` from `lib/presence`; types from `src/shared/types`; `persist` from `zustand/middleware`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/store/discoveryStore.test.ts  (REPLACES the file)
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoverySnapshot, Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "./discoveryStore";

function host(id: string): Host {
	return { id, displayName: id, hostname: `${id}.local.`, addresses: [{ value: "10.0.0.2", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true };
}
function inst(key: string, hostId: string): Instance {
	return { key, name: key, serviceType: "_x._tcp", protocol: "tcp", port: 0, txt: {}, hostId, firstSeen: 0, lastSeen: 0, present: true };
}
const snap: DiscoverySnapshot = { hosts: [host("h")], instances: [inst("k", "h")] };

beforeEach(() => {
	useDiscoveryStore.setState({
		hosts: new Map(),
		instances: new Map(),
		status: { live: false, scanning: false },
		selection: null,
		query: "",
		expanded: new Set(),
		pausedAt: 0,
		now: 0,
		toast: null,
	});
});

describe("data", () => {
	it("applySnapshot replaces the maps", () => {
		useDiscoveryStore.getState().applySnapshot(snap);
		expect(useDiscoveryStore.getState().instances.get("k")?.name).toBe("k");
		expect(useDiscoveryStore.getState().hosts.get("h")?.hostname).toBe("h.local.");
	});
	it("applyDelta upserts and removes", () => {
		useDiscoveryStore.getState().applySnapshot(snap);
		useDiscoveryStore.getState().applyDelta({ removeInstanceKeys: ["k"] });
		expect(useDiscoveryStore.getState().instances.has("k")).toBe(false);
	});
});

describe("status → pausedAt", () => {
	it("records pausedAt at current now when live falls, clears on resume", () => {
		const s = useDiscoveryStore.getState();
		s.tick(5000);
		s.applyStatus({ live: false, scanning: false });
		expect(useDiscoveryStore.getState().pausedAt).toBe(5000);
		s.applyStatus({ live: true, scanning: false });
		expect(useDiscoveryStore.getState().pausedAt).toBe(0);
	});
});

describe("selection + expand", () => {
	it("selectSvc selects and expands the group", () => {
		useDiscoveryStore.getState().selectSvc("_airplay._tcp");
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "svc", id: "_airplay._tcp" });
		expect(useDiscoveryStore.getState().expanded.has("svc:_airplay._tcp")).toBe(true);
	});
	it("toggleExpand flips membership", () => {
		useDiscoveryStore.getState().toggleExpand("host:h");
		expect(useDiscoveryStore.getState().expanded.has("host:h")).toBe(true);
		useDiscoveryStore.getState().toggleExpand("host:h");
		expect(useDiscoveryStore.getState().expanded.has("host:h")).toBe(false);
	});
	it("expandAll/collapseAll replace the set", () => {
		useDiscoveryStore.getState().expandAll(["a", "b"]);
		expect(useDiscoveryStore.getState().expanded.size).toBe(2);
		useDiscoveryStore.getState().collapseAll();
		expect(useDiscoveryStore.getState().expanded.size).toBe(0);
	});
});

describe("search + toast", () => {
	it("setQuery / clearSearch", () => {
		useDiscoveryStore.getState().setQuery("hue");
		expect(useDiscoveryStore.getState().query).toBe("hue");
		useDiscoveryStore.getState().clearSearch();
		expect(useDiscoveryStore.getState().query).toBe("");
	});
	it("showToast sets and auto-dismisses after 1900ms", () => {
		vi.useFakeTimers();
		useDiscoveryStore.getState().showToast("Copied foo");
		expect(useDiscoveryStore.getState().toast).toBe("Copied foo");
		vi.advanceTimersByTime(1900);
		expect(useDiscoveryStore.getState().toast).toBeNull();
		vi.useRealTimers();
	});
});
```

```ts
// src/renderer/store/settingsStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settingsStore";

beforeEach(() => {
	localStorage.clear();
	useSettingsStore.setState({ appearance: "dark", mode: "service", sortBy: "name", showDesc: true, showV6: true, showLinkLocal: true });
});

describe("settingsStore", () => {
	it("defaults to dark / service / name and all show-toggles on", () => {
		const s = useSettingsStore.getState();
		expect(s.appearance).toBe("dark");
		expect(s.mode).toBe("service");
		expect(s.sortBy).toBe("name");
		expect([s.showDesc, s.showV6, s.showLinkLocal]).toEqual([true, true, true]);
	});
	it("toggleAppearance flips dark/light", () => {
		useSettingsStore.getState().toggleAppearance();
		expect(useSettingsStore.getState().appearance).toBe("light");
	});
	it("setMode / toggleShowV6 mutate", () => {
		useSettingsStore.getState().setMode("ip");
		useSettingsStore.getState().toggleShowV6();
		expect(useSettingsStore.getState().mode).toBe("ip");
		expect(useSettingsStore.getState().showV6).toBe(false);
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/store`
Expected: FAIL (new actions / settingsStore absent).

- [ ] **Step 3: Rewrite `src/renderer/store/discoveryStore.ts`**

```ts
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
	applySnapshot: (snapshot: DiscoverySnapshot) => void;
	applyDelta: (delta: DiscoveryDelta) => void;
	applyStatus: (status: DiscoveryStatus) => void;
	tick: (now: number) => void;
	selectInst: (id: string) => void;
	selectSvc: (id: string) => void;
	selectHost: (id: string) => void;
	selectIp: (id: string) => void;
	toggleExpand: (id: string) => void;
	expandAll: (ids: string[]) => void;
	collapseAll: () => void;
	setQuery: (q: string) => void;
	clearSearch: () => void;
	showToast: (msg: string) => void;
	dismissToast: () => void;
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
			let pausedAt = s.pausedAt;
			if (status.live) pausedAt = 0;
			else if (s.status.live) pausedAt = s.now;
			return { status, pausedAt };
		}),

	tick: (now) => set({ now }),

	selectInst: (id) => set({ selection: { kind: "inst", id } }),
	selectSvc: (id) => set((s) => ({ selection: { kind: "svc", id }, expanded: new Set(s.expanded).add(`svc:${id}`) })),
	selectHost: (id) => set((s) => ({ selection: { kind: "host", id }, expanded: new Set(s.expanded).add(`host:${id}`) })),
	selectIp: (id) => set({ selection: { kind: "ip", id } }),

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
}));
```

- [ ] **Step 4: Write `src/renderer/store/settingsStore.ts`**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lens = "service" | "host" | "ip" | "all";
export type SortBy = "name" | "ip" | "lastseen";
export type Appearance = "dark" | "light";

interface SettingsState {
	appearance: Appearance;
	mode: Lens;
	sortBy: SortBy;
	showDesc: boolean;
	showV6: boolean;
	showLinkLocal: boolean;
	setAppearance: (a: Appearance) => void;
	toggleAppearance: () => void;
	setMode: (m: Lens) => void;
	setSortBy: (s: SortBy) => void;
	toggleShowDesc: () => void;
	toggleShowV6: () => void;
	toggleShowLinkLocal: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			appearance: "dark",
			mode: "service",
			sortBy: "name",
			showDesc: true,
			showV6: true,
			showLinkLocal: true,
			setAppearance: (appearance) => set({ appearance }),
			toggleAppearance: () => set((s) => ({ appearance: s.appearance === "dark" ? "light" : "dark" })),
			setMode: (mode) => set({ mode }),
			setSortBy: (sortBy) => set({ sortBy }),
			toggleShowDesc: () => set((s) => ({ showDesc: !s.showDesc })),
			toggleShowV6: () => set((s) => ({ showV6: !s.showV6 })),
			toggleShowLinkLocal: () => set((s) => ({ showLinkLocal: !s.showLinkLocal })),
		}),
		{ name: "beacon.settings", version: 1 },
	),
);
```

- [ ] **Step 5: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/store && pnpm typecheck && pnpm lint`
Expected: PASS / clean. (`tsc` will also confirm nothing else imported the removed `selectRows`/`InstanceRow` — if `App.tsx` from Plan 2 still referenced them, Task 1 already replaced it.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/store
git commit -m "feat(ui): UI state in discovery store + persisted settings store"
```

---

### Task 4: Lens selectors (`visibleInstances`, counts, four builders)

**Files:**
- Create: `src/renderer/lib/selectors.ts`
- Test: `src/renderer/lib/selectors.test.ts`

**Interfaces:**
- Consumes: `primaryIp`, `isNew`, `isLeft`, `cmpIp`, `addrAllowed` from `lib/presence`; `serviceMeta` from `lib/serviceTypes`; `Selection` from `store/discoveryStore`; `SortBy` from `store/settingsStore`; `Host`, `Instance`, `AddrFamily` from `shared/types`.
- Produces (consumed by lens components in Tasks 8–10):
  - `interface ViewSettings { showDesc: boolean; showV6: boolean; showLinkLocal: boolean; sortBy: SortBy }`
  - `interface SelectorCtx { hosts: Map<string, Host>; settings: ViewSettings; query: string; expanded: Set<string>; selection: Selection | null; now: number }`
  - `interface TreeChild { id: string; title: string; subtitle?: string; chip: string | null; port: number; isNew: boolean; isLeft: boolean; selected: boolean }`
  - `interface TreeGroup { id: string; title: string; subtitle?: string; count: number; proto?: string; chip: string | null; expanded: boolean; selected: boolean; children: TreeChild[] }`
  - `interface IpAddressRow { id: string; ip: string; hostName: string; ports: number[]; selected: boolean }`
  - `interface IpGroup { family: AddrFamily; label: string; count: number; addresses: IpAddressRow[] }`
  - `interface FlatRow { id: string; name: string; serviceType: string; chip: string | null; port: number; isNew: boolean; isLeft: boolean; selected: boolean }`
  - `interface LensCounts { hosts: number; services: number; instances: number; ips: number }`
  - `visibleInstances(all: Instance[], hosts: Map<string, Host>, query: string): Instance[]`
  - `lensCounts(visible: Instance[], ctx: SelectorCtx): LensCounts`
  - `buildServiceTree(visible: Instance[], ctx: SelectorCtx): TreeGroup[]`
  - `buildHostTree(visible: Instance[], ctx: SelectorCtx): TreeGroup[]`
  - `buildIpGroups(visible: Instance[], ctx: SelectorCtx): IpGroup[]`
  - `buildFlat(visible: Instance[], ctx: SelectorCtx): FlatRow[]`

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/lib/selectors.test.ts
import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { buildFlat, buildHostTree, buildIpGroups, buildServiceTree, lensCounts, type SelectorCtx, visibleInstances } from "./selectors";

const mac: Host = {
	id: "mac", displayName: "Mac Studio", hostname: "Mac.local.",
	addresses: [{ value: "10.0.0.2", family: "ipv4" }, { value: "fe80::1", family: "linklocal", zone: "en0" }, { value: "fdc9::9", family: "ipv6" }],
	firstSeen: 0, lastSeen: 0, present: true,
};
const hub: Host = {
	id: "hub", displayName: "Aqara Hub", hostname: "Aqara.local.",
	addresses: [{ value: "10.0.0.9", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true,
};
const hosts = new Map<string, Host>([["mac", mac], ["hub", hub]]);

function i(over: Partial<Instance> & Pick<Instance, "key" | "serviceType" | "hostId">): Instance {
	return { name: over.name ?? over.key, protocol: "tcp", port: 0, txt: {}, firstSeen: 0, lastSeen: 0, present: true, ...over };
}
const insts: Instance[] = [
	i({ key: "a", name: "Mac Studio", serviceType: "_airplay._tcp", hostId: "mac", port: 7000 }),
	i({ key: "b", name: "Mac Studio", serviceType: "_ssh._tcp", hostId: "mac", port: 22 }),
	i({ key: "c", name: "Aqara Hub", serviceType: "_matter._tcp", hostId: "hub", port: 5540, txt: { vp: "abc" } }),
];

function ctx(over: Partial<SelectorCtx> = {}): SelectorCtx {
	return {
		hosts,
		settings: { showDesc: true, showV6: true, showLinkLocal: true, sortBy: "name" },
		query: "",
		expanded: new Set(),
		selection: null,
		now: 0,
		...over,
	};
}

describe("visibleInstances", () => {
	it("returns all when query empty", () => {
		expect(visibleInstances(insts, hosts, "")).toHaveLength(3);
	});
	it("matches name, service type, host fields, address, and txt", () => {
		expect(visibleInstances(insts, hosts, "ssh").map((x) => x.key)).toEqual(["b"]);
		expect(visibleInstances(insts, hosts, "aqara").map((x) => x.key)).toEqual(["c"]);
		expect(visibleInstances(insts, hosts, "10.0.0.9").map((x) => x.key)).toEqual(["c"]);
		expect(visibleInstances(insts, hosts, "vp=abc").map((x) => x.key)).toEqual(["c"]);
	});
});

describe("lensCounts", () => {
	it("counts distinct hosts/services/instances and allowed addresses", () => {
		expect(lensCounts(insts, ctx())).toEqual({ hosts: 2, services: 3, instances: 3, ips: 4 });
		expect(lensCounts(insts, ctx({ settings: { showDesc: true, showV6: false, showLinkLocal: false, sortBy: "name" } })).ips).toBe(2);
	});
});

describe("buildServiceTree", () => {
	it("groups by service type (sorted), tags proto + count, gates children on expanded", () => {
		const groups = buildServiceTree(insts, ctx());
		expect(groups.map((g) => g.id)).toEqual(["svc:_airplay._tcp", "svc:_matter._tcp", "svc:_ssh._tcp"]);
		const airplay = groups[0]!;
		expect(airplay.proto).toBe("TCP");
		expect(airplay.count).toBe(1);
		expect(airplay.subtitle).toBe("Protocol for streaming of audio/video content");
		expect(airplay.children).toHaveLength(0); // collapsed
	});
	it("expands a group when in the expanded set; child carries host hostname + primary ip chip + port", () => {
		const groups = buildServiceTree(insts, ctx({ expanded: new Set(["svc:_airplay._tcp"]) }));
		const child = groups[0]!.children[0]!;
		expect(child).toMatchObject({ id: "a", title: "Mac Studio", subtitle: "Mac.local.", chip: "10.0.0.2", port: 7000 });
	});
	it("force-expands every group when search is active", () => {
		const groups = buildServiceTree(insts, ctx({ query: "mac" }));
		expect(groups.every((g) => g.expanded)).toBe(true);
	});
	it("drops the group subtitle when showDesc is off", () => {
		const groups = buildServiceTree(insts, ctx({ settings: { showDesc: false, showV6: true, showLinkLocal: true, sortBy: "name" } }));
		expect(groups[0]!.subtitle).toBeUndefined();
	});
});

describe("buildHostTree", () => {
	it("groups by host (sorted by display name), gray chip = primary ip, children sorted by service type", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups.map((g) => g.title)).toEqual(["Aqara Hub", "Mac Studio"]);
		const macGroup = groups[1]!;
		expect(macGroup.chip).toBe("10.0.0.2");
		expect(macGroup.children.map((c) => c.title)).toEqual(["_airplay._tcp", "_ssh._tcp"]);
	});
	it("child subtitle appears only when instance name differs from host name", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups[1]!.children[0]!.subtitle).toBeUndefined(); // "Mac Studio" == host display name
	});
});

describe("buildIpGroups", () => {
	it("groups addresses by family in order, with host ports and copy ids", () => {
		const groups = buildIpGroups(insts, ctx());
		expect(groups.map((g) => g.family)).toEqual(["ipv4", "ipv6", "linklocal"]);
		const v4 = groups[0]!;
		expect(v4.label).toBe("IPv4");
		expect(v4.addresses.map((a) => a.ip).sort()).toEqual(["10.0.0.2", "10.0.0.9"]);
		const macRow = v4.addresses.find((a) => a.ip === "10.0.0.2")!;
		expect(macRow.id).toBe("mac|10.0.0.2");
		expect(macRow.ports).toEqual([22, 7000]);
	});
	it("respects show-toggles", () => {
		const groups = buildIpGroups(insts, ctx({ settings: { showDesc: true, showV6: false, showLinkLocal: false, sortBy: "name" } }));
		expect(groups.map((g) => g.family)).toEqual(["ipv4"]);
	});
});

describe("buildFlat", () => {
	it("sorts by name then service type by default", () => {
		expect(buildFlat(insts, ctx()).map((r) => r.id)).toEqual(["c", "a", "b"]);
	});
	it("sorts by ip when sortBy=ip", () => {
		const rows = buildFlat(insts, ctx({ settings: { showDesc: true, showV6: true, showLinkLocal: true, sortBy: "ip" } }));
		expect(rows[0]!.chip).toBe("10.0.0.2");
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/lib/selectors.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement `src/renderer/lib/selectors.ts`**

```ts
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
const FAMILY_LABEL: Record<AddrFamily, string> = { ipv4: "IPv4", ipv6: "IPv6", linklocal: "Link-local", loopback: "Loopback" };

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

function childOf(it: Instance, ctx: SelectorCtx, opts: { title: string; subtitle?: string; chip: string | null }): TreeChild {
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
	for (const it of visible) (byType.get(it.serviceType) ?? byType.set(it.serviceType, []).get(it.serviceType))?.push(it);
	const active = searchActive(ctx);
	return [...byType.keys()]
		.sort()
		.map((t) => {
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
					? list.map((it) => childOf(it, ctx, { title: it.name, subtitle: ctx.hosts.get(it.hostId)?.hostname, chip: primaryIp(ctx.hosts.get(it.hostId)) }))
					: [],
			};
		});
}

export function buildHostTree(visible: Instance[], ctx: SelectorCtx): TreeGroup[] {
	const byHost = new Map<string, Instance[]>();
	for (const it of visible) (byHost.get(it.hostId) ?? byHost.set(it.hostId, []).get(it.hostId))?.push(it);
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
					? list.map((it) => childOf(it, ctx, { title: it.serviceType, subtitle: it.name !== h?.displayName ? it.name : undefined, chip: null }))
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
		const ports = [...new Set(visible.filter((i) => i.hostId === hid && i.port > 0).map((i) => i.port))].sort((a, b) => a - b);
		for (const a of h.addresses) {
			if (!addrAllowed(a.family, ctx.settings)) continue;
			if (q && !a.value.toLowerCase().includes(q) && !h.displayName.toLowerCase().includes(q) && !h.hostname.toLowerCase().includes(q)) continue;
			const id = `${h.id}|${a.value}`;
			const row: IpAddressRow = { id, ip: a.value, hostName: h.displayName, ports, selected: ctx.selection?.kind === "ip" && ctx.selection.id === id };
			(groups.get(a.family) ?? groups.set(a.family, []).get(a.family))?.push(row);
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
		if (sb === "ip") return cmpIp(primaryIp(ctx.hosts.get(a.hostId)), primaryIp(ctx.hosts.get(b.hostId))) || a.name.localeCompare(b.name);
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
```

> Note: the `(map.get(k) ?? map.set(k, []).get(k))?.push(v)` idiom appends to a bucket, creating it on first use. If Biome flags it, refactor to an explicit `let arr = map.get(k); if (!arr) { arr = []; map.set(k, arr); } arr.push(v);` — same behavior.

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/lib/selectors.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/selectors.ts src/renderer/lib/selectors.test.ts
git commit -m "feat(ui): lens selectors — visibleInstances, counts, service/host/ip/flat builders"
```

---

### Task 5: Detail builder (`buildDetail` + `addrGroups`)

**Files:**
- Create: `src/renderer/lib/detail.ts`
- Test: `src/renderer/lib/detail.test.ts`

**Interfaces:**
- Consumes: `primaryIp`, `cmpIp`, `addrAllowed`, `relativeLastSeen`, `isLeft` from `lib/presence`; `serviceMeta`, `webScheme`, `webUrl`, `INSTANCE_WEB_TYPES`, `HOST_WEB_TYPES` from `lib/serviceTypes`; `visibleInstances` from `lib/selectors`; `Selection` from `store/discoveryStore`; `AddrFamily`, `Host`, `Instance` from `shared/types`.
- Produces (consumed by Task 11 detail components):
  - `type DetailIconKind = "instance" | "host" | "service" | "ip"`
  - `interface DetailAction { id: string; label: string; icon: "ext" | "copy" | "resolve" | "reveal"; primary: boolean; kind: "open" | "copy" | "resolve" | "reveal"; value: string }`
  - `interface DetailAddress { ip: string; endpoint: boolean; portText: string; copyValue: string }`
  - `interface DetailAddrGroup { family: AddrFamily; label: string; addresses: DetailAddress[] }`
  - `interface MetaRow { label: string; value: string; font: "sans" | "mono"; link?: { hostId: string }; copyable?: boolean }`
  - `interface ServiceRow { id: string; title: string; subtitle?: string; port: number }`
  - `interface AdvertisedHost { id: string; name: string; sub: string; chip: string | null }`
  - `interface TxtRow { key: string; value: string }`
  - `interface DetailModel { kind: DetailIconKind; name: string; nameMono: boolean; status?: { live: boolean; label: string }; sub?: string; serviceDesc?: string; actions: DetailAction[]; addrTitle?: string; addrGroups: DetailAddrGroup[]; meta: MetaRow[]; servicesTitle?: string; services: ServiceRow[]; hostsTitle?: string; hosts: AdvertisedHost[]; hasTxt: boolean; txtTitle?: string; txt: TxtRow[]; noTxt: boolean }`
  - `interface DetailCtx { instances: Map<string, Instance>; hosts: Map<string, Host>; settings: { showDesc: boolean; showV6: boolean; showLinkLocal: boolean }; query: string; now: number }`
  - `buildDetail(selection: Selection | null, ctx: DetailCtx): DetailModel | null` — `null` ⇒ empty state.

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/lib/detail.test.ts
import { describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { buildDetail, type DetailCtx } from "./detail";

const mac: Host = {
	id: "mac", displayName: "Mac Studio", hostname: "Mac.local.",
	addresses: [{ value: "10.0.0.2", family: "ipv4" }, { value: "fe80::1", family: "linklocal", zone: "en0" }],
	firstSeen: 0, lastSeen: 0, present: true,
};
const air: Instance = { key: "air", name: "Mac Studio", serviceType: "_airplay._tcp", protocol: "tcp", port: 7000, txt: { model: "Mac14,14" }, hostId: "mac", firstSeen: 0, lastSeen: 0, present: true };
const web: Instance = { key: "web", name: "Mac Studio", serviceType: "_http._tcp", protocol: "tcp", port: 80, txt: {}, hostId: "mac", firstSeen: 0, lastSeen: 0, present: true };
const ctx: DetailCtx = {
	hosts: new Map([["mac", mac]]),
	instances: new Map([["air", air], ["web", web]]),
	settings: { showDesc: true, showV6: true, showLinkLocal: true },
	query: "",
	now: 0,
};

describe("buildDetail — null", () => {
	it("returns null for no selection or a miss", () => {
		expect(buildDetail(null, ctx)).toBeNull();
		expect(buildDetail({ kind: "inst", id: "nope" }, ctx)).toBeNull();
	});
});

describe("buildDetail — instance", () => {
	const d = buildDetail({ kind: "inst", id: "air" }, ctx)!;
	it("has a Live status, sub line, and service description", () => {
		expect(d.kind).toBe("instance");
		expect(d.status).toEqual({ live: true, label: "Live" });
		expect(d.sub).toBe("_airplay._tcp  ·  Mac.local.");
		expect(d.serviceDesc).toBe("Protocol for streaming of audio/video content");
	});
	it("omits Open-in-Browser for non-web types but includes Copy Hostname / Resolve / Show Host", () => {
		expect(d.actions.map((a) => a.kind)).toEqual(["copy", "resolve", "reveal"]);
	});
	it("includes an Open action with a built URL for web types", () => {
		const w = buildDetail({ kind: "inst", id: "web" }, ctx)!;
		expect(w.actions[0]).toMatchObject({ kind: "open", primary: true, value: "http://10.0.0.2:80" });
	});
	it("meta has Port only when > 0 and groups addresses with endpoints", () => {
		expect(d.meta.find((m) => m.label === "Port")?.value).toBe("7000");
		expect(d.addrGroups[0]!.addresses[0]).toMatchObject({ ip: "10.0.0.2", endpoint: true, portText: ":7000", copyValue: "10.0.0.2:7000" });
	});
	it("renders TXT rows, or the no-TXT flag when empty", () => {
		expect(d.hasTxt).toBe(true);
		expect(d.txt).toEqual([{ key: "model", value: "Mac14,14" }]);
		expect(buildDetail({ kind: "inst", id: "web" }, ctx)!.noTxt).toBe(true);
	});
});

describe("buildDetail — host", () => {
	const d = buildDetail({ kind: "host", id: "mac" }, ctx)!;
	it("uses Online label and lists advertised services sorted by type", () => {
		expect(d.status).toEqual({ live: true, label: "Online" });
		expect(d.servicesTitle).toBe("Services advertised (2)");
		expect(d.services.map((s) => s.title)).toEqual(["_airplay._tcp", "_http._tcp"]);
	});
});

describe("buildDetail — service type", () => {
	const d = buildDetail({ kind: "svc", id: "_airplay._tcp" }, ctx)!;
	it("shows a mono name, always-on description, and an Advertised-by list", () => {
		expect(d.nameMono).toBe(true);
		expect(d.serviceDesc).toBe("Protocol for streaming of audio/video content");
		expect(d.hostsTitle).toBe("Advertised by");
		expect(d.hosts[0]).toMatchObject({ name: "Mac Studio", sub: "Mac.local.", chip: "10.0.0.2" });
	});
});

describe("buildDetail — ip", () => {
	const d = buildDetail({ kind: "ip", id: "mac|10.0.0.2" }, ctx)!;
	it("shows scope meta and services-on-host", () => {
		expect(d.nameMono).toBe(true);
		expect(d.meta.find((m) => m.label === "Scope")?.value).toBe("Private (RFC 1918)");
		expect(d.servicesTitle).toBe("Services on this host (2)");
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/lib/detail.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement `src/renderer/lib/detail.ts`**

```ts
import type { AddrFamily, Host, Instance } from "../../shared/types";
import type { Selection } from "../store/discoveryStore";
import { addrAllowed, cmpIp, primaryIp, relativeLastSeen } from "./presence";
import { HOST_WEB_TYPES, INSTANCE_WEB_TYPES, serviceMeta, webUrl } from "./serviceTypes";
import { visibleInstances } from "./selectors";

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
const FAMILY_LABEL: Record<AddrFamily, string> = { ipv4: "IPv4", ipv6: "IPv6", linklocal: "Link-local", loopback: "Loopback" };
const IP_TYPE_LABEL: Record<AddrFamily, string> = {
	ipv4: "IPv4 address", ipv6: "IPv6 address", linklocal: "Link-local address", loopback: "Loopback address",
};
const IP_SCOPE: Record<AddrFamily, string> = {
	ipv4: "Private (RFC 1918)", ipv6: "Unique local (ULA)", linklocal: "Link-local (fe80::/10)", loopback: "Loopback",
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
	return [...instances.values()].filter((i) => i.hostId === hostId).sort((a, b) => a.serviceType.localeCompare(b.serviceType));
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
	actions.push({ id: "copy-host", label: "Copy Hostname", icon: "copy", primary: false, kind: "copy", value: h?.hostname ?? "" });
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
	const insts = [...ctx.instances.values()].filter((i) => i.hostId === h.id).sort((a, b) => a.serviceType.localeCompare(b.serviceType));
	const actions: DetailAction[] = [];
	const webInst = insts.find((i) => HOST_WEB_TYPES.has(i.serviceType));
	if (webInst) {
		const url = webUrl(webInst.serviceType, ip, webInst.port);
		if (url) actions.push({ id: "open", label: `Open ${url.replace(/:\d+$/, "")}`, icon: "ext", primary: true, kind: "open", value: url });
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
```

- [ ] **Step 4: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/lib/detail.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/detail.ts src/renderer/lib/detail.test.ts
git commit -m "feat(ui): detail builder for instance/host/service/ip selections"
```

---

### Task 6: Command layer + Toolbar core (live, lenses, search, rescan, theme)

**Files:**
- Create: `src/renderer/lib/commands.ts`, `src/renderer/components/Toolbar.tsx`, `src/renderer/components/Toolbar.module.css`, `src/renderer/components/LiveToggle.tsx`, `src/renderer/components/LiveToggle.module.css`, `src/renderer/components/SearchField.tsx`
- Modify: `src/renderer/App.tsx` (render `<Toolbar/>` into the `.bcn-toolbar` slot)
- Test: `src/renderer/lib/commands.test.ts`, `src/renderer/components/Toolbar.test.tsx`

**Interfaces:**
- Produces:
  - `commands.ts`: `toggleLive(): Promise<void>`, `rescan(): Promise<void>`, `copyText(text: string, label?: string): Promise<void>`, `openUrl(url: string): Promise<void>`, `resolveInstance(key: string): Promise<void>`, `revealHost(hostId: string): void`, `runDetailAction(action: { kind: string; value: string }): void`, `exportAs(kind: "json" | "csv" | "txt"): void`.
  - `Toolbar` (function component, no props). `LiveToggle`, `SearchField` likewise.
- Consumes: stores; `lib/export`, `lib/presence`, `lib/selectors`, `lib/icons`; Radix `SegmentedControl`, `TextField`, `IconButton`, `Tooltip`, `Button`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/renderer/lib/commands.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { copyText, exportAs, rescan, toggleLive } from "./commands";

beforeEach(() => {
	useDiscoveryStore.setState({ instances: new Map(), hosts: new Map(), status: { live: true, scanning: false }, toast: null, query: "", now: 0, pausedAt: 0 });
	window.beacon = { setLive: vi.fn().mockResolvedValue(undefined), rescan: vi.fn().mockResolvedValue(undefined), resolve: vi.fn().mockResolvedValue(undefined), openExternal: vi.fn().mockResolvedValue(undefined), getSnapshot: vi.fn(), onSnapshot: vi.fn(), onDelta: vi.fn(), onStatus: vi.fn() } as unknown as typeof window.beacon;
});

describe("commands", () => {
	it("toggleLive sends the negated live state", async () => {
		await toggleLive();
		expect(window.beacon.setLive).toHaveBeenCalledWith(false);
	});
	it("rescan invokes beacon.rescan", async () => {
		await rescan();
		expect(window.beacon.rescan).toHaveBeenCalled();
	});
	it("copyText writes to clipboard and toasts", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		await copyText("10.0.0.2", "10.0.0.2");
		expect(writeText).toHaveBeenCalledWith("10.0.0.2");
		expect(useDiscoveryStore.getState().toast).toBe("Copied 10.0.0.2");
	});
	it("exportAs(txt) copies a snapshot and toasts", async () => {
		await exportAs("txt");
		expect(useDiscoveryStore.getState().toast).toBe("Copied snapshot");
	});
});
```

```tsx
// src/renderer/components/Toolbar.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { Toolbar } from "./Toolbar";

function renderToolbar() {
	return render(
		<Theme appearance="dark" accentColor="indigo" grayColor="slate">
			<Toolbar />
		</Theme>,
	);
}

beforeEach(() => {
	window.beacon = { setLive: vi.fn().mockResolvedValue(undefined), rescan: vi.fn().mockResolvedValue(undefined), resolve: vi.fn(), openExternal: vi.fn(), getSnapshot: vi.fn(), onSnapshot: vi.fn(), onDelta: vi.fn(), onStatus: vi.fn() } as unknown as typeof window.beacon;
	useSettingsStore.setState({ mode: "service", appearance: "dark" });
	useDiscoveryStore.setState({ query: "", status: { live: true, scanning: false } });
});

describe("Toolbar", () => {
	it("switches lens when a segment is clicked", () => {
		renderToolbar();
		fireEvent.click(screen.getByText("Hosts"));
		expect(useSettingsStore.getState().mode).toBe("host");
	});
	it("updates the query as the search field changes", () => {
		renderToolbar();
		fireEvent.change(screen.getByPlaceholderText("Search services, hosts, IPs…"), { target: { value: "hue" } });
		expect(useDiscoveryStore.getState().query).toBe("hue");
	});
	it("rescans on the rescan button", () => {
		renderToolbar();
		fireEvent.click(screen.getByRole("button", { name: "Rescan network" }));
		expect(window.beacon.rescan).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/lib/commands.test.ts src/renderer/components/Toolbar.test.tsx`
Expected: FAIL (modules absent).

- [ ] **Step 3: Implement `src/renderer/lib/commands.ts`**

```ts
import { toCSV, toJSON, toText, triggerDownload } from "./export";
import { primaryIp, trunc } from "./presence";
import { visibleInstances } from "./selectors";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";

export async function toggleLive(): Promise<void> {
	const { live } = useDiscoveryStore.getState().status;
	await window.beacon.setLive(!live);
}

export async function rescan(): Promise<void> {
	await window.beacon.rescan();
}

export async function copyText(text: string, label?: string): Promise<void> {
	try {
		await navigator.clipboard?.writeText(text);
	} catch {
		/* clipboard unavailable */
	}
	useDiscoveryStore.getState().showToast(`Copied ${trunc(label ?? text)}`);
}

export async function openUrl(url: string): Promise<void> {
	await window.beacon.openExternal(url);
	useDiscoveryStore.getState().showToast(`Opening ${url}`);
}

export async function resolveInstance(key: string): Promise<void> {
	const s = useDiscoveryStore.getState();
	const it = s.instances.get(key);
	const h = it ? s.hosts.get(it.hostId) : undefined;
	await window.beacon.resolve(key);
	s.showToast(`Resolved ${h?.hostname ?? key} → ${primaryIp(h) ?? "—"}`);
}

export function revealHost(hostId: string): void {
	useSettingsStore.getState().setMode("host");
	useDiscoveryStore.getState().selectHost(hostId);
}

export function runDetailAction(action: { kind: string; value: string }): void {
	if (action.kind === "open") void openUrl(action.value);
	else if (action.kind === "copy") void copyText(action.value);
	else if (action.kind === "resolve") void resolveInstance(action.value);
	else if (action.kind === "reveal") revealHost(action.value);
}

export function exportAs(kind: "json" | "csv" | "txt"): void {
	const s = useDiscoveryStore.getState();
	const visible = visibleInstances([...s.instances.values()], s.hosts, s.query);
	if (kind === "json") {
		triggerDownload("beacon-snapshot.json", "application/json", toJSON(visible, s.hosts));
		s.showToast(`Exported ${visible.length} records as JSON`);
	} else if (kind === "csv") {
		triggerDownload("beacon-snapshot.csv", "text/csv", toCSV(visible, s.hosts));
		s.showToast(`Exported ${visible.length} records as CSV`);
	} else {
		void copyText(toText(visible, s.hosts), "snapshot");
	}
}
```

- [ ] **Step 4: Implement `src/renderer/components/LiveToggle.tsx` + `LiveToggle.module.css`**

```tsx
import { Tooltip } from "@radix-ui/themes";
import { useDiscoveryStore } from "../store/discoveryStore";
import { ageLabel, staleness } from "../lib/presence";
import { PauseBars, PlayTriangle } from "../lib/icons";
import styles from "./LiveToggle.module.css";
import { toggleLive } from "../lib/commands";

export function LiveToggle() {
	const status = useDiscoveryStore((s) => s.status);
	const now = useDiscoveryStore((s) => s.now);
	const pausedAt = useDiscoveryStore((s) => s.pausedAt);
	const pausedAgeS = status.live || pausedAt === 0 ? 0 : Math.floor((now - pausedAt) / 1000);
	const stale = staleness(status.live, pausedAgeS);
	const dotClass = status.live ? styles.dotLive : stale === "stale" ? styles.dotStale : styles.dotPaused;
	return (
		<Tooltip content={status.live ? "Pause discovery" : "Resume discovery"}>
			<button type="button" className={styles.toggle} onClick={() => void toggleLive()}>
				<span className={`${styles.dot} ${dotClass}`} />
				<span className={styles.label}>{status.live ? "Live" : "Paused"}</span>
				{!status.live && <span className={styles.age}>{ageLabel(pausedAgeS)}</span>}
				{status.live ? <PauseBars /> : <PlayTriangle />}
			</button>
		</Tooltip>
	);
}
```

```css
/* LiveToggle.module.css */
.toggle {
	margin-left: 4px;
	height: 28px;
	padding: 0 11px;
	display: flex;
	align-items: center;
	gap: 7px;
	border-radius: 8px;
	background: var(--gray-a3);
	border: 1px solid var(--gray-a6);
	color: var(--gray-12);
	cursor: pointer;
}
.toggle:hover {
	background: var(--gray-a5);
}
.dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
}
.dotLive {
	background: var(--green-9);
	animation: bcn-liveplus 2s infinite;
}
.dotPaused {
	background: var(--gray-8);
}
.dotStale {
	background: var(--amber-9);
	animation: bcn-amberpulse 1.6s infinite;
}
.label {
	font-size: 12px;
	font-weight: 600;
}
.age {
	font-size: 11px;
	color: var(--gray-10);
	font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Implement `src/renderer/components/SearchField.tsx`**

```tsx
import { TextField } from "@radix-ui/themes";
import { useDiscoveryStore } from "../store/discoveryStore";
import { ClearX, Search } from "../lib/icons";

export function SearchField() {
	const query = useDiscoveryStore((s) => s.query);
	const setQuery = useDiscoveryStore((s) => s.setQuery);
	const clearSearch = useDiscoveryStore((s) => s.clearSearch);
	return (
		<TextField.Root
			id="beacon-search"
			size="2"
			placeholder="Search services, hosts, IPs…"
			spellCheck={false}
			value={query}
			onChange={(e) => setQuery(e.target.value)}
			style={{ flex: "0 1 200px", minWidth: 80 }}
		>
			<TextField.Slot>
				<Search />
			</TextField.Slot>
			{query && (
				<TextField.Slot>
					<button type="button" aria-label="Clear search" onClick={() => clearSearch()} style={{ all: "unset", cursor: "pointer", color: "var(--gray-10)", display: "flex" }}>
						<ClearX />
					</button>
				</TextField.Slot>
			)}
		</TextField.Root>
	);
}
```

- [ ] **Step 6: Implement `src/renderer/components/Toolbar.tsx` + `Toolbar.module.css`**

`ViewMenu` and `ExportMenu` arrive in Task 7 — leave their mount points as TODO comments now, so this task stands alone and compiles.

```tsx
import { Button, IconButton, SegmentedControl, Tooltip } from "@radix-ui/themes";
import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";
import { rescan } from "../lib/commands";
import { Download, Refresh, Sun } from "../lib/icons";
import { LiveToggle } from "./LiveToggle";
import { SearchField } from "./SearchField";
import styles from "./Toolbar.module.css";

const SEGMENTS: { value: Lens; label: string }[] = [
	{ value: "service", label: "Services" },
	{ value: "host", label: "Hosts" },
	{ value: "ip", label: "IPs" },
	{ value: "all", label: "All" },
];

export function Toolbar() {
	const mode = useSettingsStore((s) => s.mode);
	const setMode = useSettingsStore((s) => s.setMode);
	const toggleAppearance = useSettingsStore((s) => s.toggleAppearance);
	const scanning = useDiscoveryStore((s) => s.status.scanning);
	return (
		<>
			<div className={styles.logoBlock}>
				<div className="bcn-logo" />
				<span className="bcn-title" title="mDNS / Bonjour browser">
					Beacon
				</span>
			</div>
			<LiveToggle />
			<SegmentedControl.Root size="1" value={mode} onValueChange={(v) => setMode(v as Lens)} className={`${styles.segmented} bcn-no-drag`}>
				{SEGMENTS.map((s) => (
					<SegmentedControl.Item key={s.value} value={s.value}>
						{s.label}
					</SegmentedControl.Item>
				))}
			</SegmentedControl.Root>
			<div className={styles.spacer} />
			<SearchField />
			<Tooltip content="Rescan network">
				<IconButton variant="ghost" size="2" aria-label="Rescan network" onClick={() => void rescan()}>
					<span className={scanning ? styles.spin : undefined}>
						<Refresh />
					</span>
				</IconButton>
			</Tooltip>
			{/* TODO(Task 7): <ViewMenu /> */}
			<Tooltip content="Toggle appearance">
				<IconButton variant="ghost" size="2" aria-label="Toggle appearance" onClick={() => toggleAppearance()}>
					<Sun />
				</IconButton>
			</Tooltip>
			{/* TODO(Task 7): <ExportMenu />, replacing this placeholder button */}
			<Button color="indigo" variant="solid" size="2">
				<Download />
				Export
			</Button>
		</>
	);
}
```

```css
/* Toolbar.module.css */
.logoBlock {
	display: flex;
	align-items: center;
	gap: 8px;
	padding-left: 2px;
}
.segmented {
	margin-left: 8px;
}
.spacer {
	flex: 1;
}
.spin {
	display: inline-flex;
	animation: bcn-spin 0.8s linear infinite;
}
```

- [ ] **Step 7: Mount `<Toolbar/>` in `App.tsx`**

Replace the toolbar's placeholder children with `<Toolbar />`:

```tsx
import { Toolbar } from "./components/Toolbar";
// ...
<header className="bcn-toolbar">
	<Toolbar />
</header>
```

- [ ] **Step 8: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/lib/commands.test.ts src/renderer/components/Toolbar.test.tsx src/renderer/App.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS / clean. Update `App.test.tsx` now that `<App/>` renders Radix components (`Toolbar`): wrap the render in `<Theme appearance="dark" accentColor="indigo" grayColor="slate">…</Theme>`. `screen.getByText("Beacon")` still resolves (the logo/title moved into `Toolbar`). The `.bcn-*` landmark and `data-staleness` assertions stay valid.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/lib/commands.ts src/renderer/components/Toolbar.tsx src/renderer/components/Toolbar.module.css src/renderer/components/LiveToggle.tsx src/renderer/components/LiveToggle.module.css src/renderer/components/SearchField.tsx src/renderer/App.tsx src/renderer/lib/commands.test.ts src/renderer/components/Toolbar.test.tsx
git commit -m "feat(ui): command layer + toolbar (live, lenses, search, rescan, theme)"
```

---

### Task 7: View-options + Export dropdown menus

**Files:**
- Create: `src/renderer/components/ViewMenu.tsx`, `src/renderer/components/ExportMenu.tsx`
- Modify: `src/renderer/components/Toolbar.tsx` (replace the two TODO placeholders with `<ViewMenu/>` / `<ExportMenu/>`)
- Test: `src/renderer/components/ViewMenu.test.tsx`, `src/renderer/components/ExportMenu.test.tsx`

**Interfaces:**
- Produces: `ViewMenu`, `ExportMenu` (function components, no props).
- Consumes: Radix `DropdownMenu`, `IconButton`, `Switch`, `Button`, `Tooltip`; `useSettingsStore`; `lib/commands.exportAs`; `lib/icons`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/renderer/components/ViewMenu.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import { ViewMenu } from "./ViewMenu";

beforeEach(() => {
	useSettingsStore.setState({ sortBy: "name", showDesc: true, showV6: true, showLinkLocal: true });
});

describe("ViewMenu", () => {
	it("changes sort and toggles a show option", async () => {
		render(
			<Theme>
				<ViewMenu />
			</Theme>,
		);
		fireEvent.click(screen.getByRole("button", { name: "View options" }));
		fireEvent.click(await screen.findByText("IP address"));
		expect(useSettingsStore.getState().sortBy).toBe("ip");
		fireEvent.click(screen.getByRole("button", { name: "View options" }));
		fireEvent.click(await screen.findByText("IPv6 addresses"));
		expect(useSettingsStore.getState().showV6).toBe(false);
	});
});
```

```tsx
// src/renderer/components/ExportMenu.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { ExportMenu } from "./ExportMenu";

beforeEach(() => {
	useDiscoveryStore.setState({ instances: new Map(), hosts: new Map(), query: "", toast: null });
});

describe("ExportMenu", () => {
	it("copies a snapshot for the text option", async () => {
		Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
		render(
			<Theme>
				<ExportMenu />
			</Theme>,
		);
		fireEvent.click(screen.getByRole("button", { name: /export/i }));
		fireEvent.click(await screen.findByText("Copy as text"));
		expect(useDiscoveryStore.getState().toast).toBe("Copied snapshot");
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/components/ViewMenu.test.tsx src/renderer/components/ExportMenu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `src/renderer/components/ViewMenu.tsx`**

```tsx
import { DropdownMenu, Flex, IconButton, Switch, Text, Tooltip } from "@radix-ui/themes";
import { type SortBy, useSettingsStore } from "../store/settingsStore";
import { ViewOptions } from "../lib/icons";

const SORTS: { value: SortBy; label: string }[] = [
	{ value: "name", label: "Name" },
	{ value: "ip", label: "IP address" },
	{ value: "lastseen", label: "Last seen" },
];

export function ViewMenu() {
	const sortBy = useSettingsStore((s) => s.sortBy);
	const setSortBy = useSettingsStore((s) => s.setSortBy);
	const showDesc = useSettingsStore((s) => s.showDesc);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);
	const toggleShowDesc = useSettingsStore((s) => s.toggleShowDesc);
	const toggleShowV6 = useSettingsStore((s) => s.toggleShowV6);
	const toggleShowLinkLocal = useSettingsStore((s) => s.toggleShowLinkLocal);

	const toggleRow = (label: string, checked: boolean, onChange: () => void) => (
		// Plain row (not DropdownMenu.Item) so toggling does not close the menu.
		<Flex asChild align="center" justify="between" px="2" py="1" gap="3">
			<label style={{ cursor: "pointer", borderRadius: 7, fontSize: 12.5 }}>
				<Text size="2">{label}</Text>
				<Switch size="1" color="indigo" checked={checked} onCheckedChange={onChange} />
			</label>
		</Flex>
	);

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Tooltip content="View options">
					<IconButton variant="ghost" size="2" aria-label="View options">
						<ViewOptions />
					</IconButton>
				</Tooltip>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ width: 236 }}>
				<DropdownMenu.Label>Sort by</DropdownMenu.Label>
				<DropdownMenu.RadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
					{SORTS.map((s) => (
						<DropdownMenu.RadioItem key={s.value} value={s.value}>
							{s.label}
						</DropdownMenu.RadioItem>
					))}
				</DropdownMenu.RadioGroup>
				<DropdownMenu.Separator />
				<DropdownMenu.Label>Show</DropdownMenu.Label>
				{toggleRow("Service descriptions", showDesc, toggleShowDesc)}
				{toggleRow("IPv6 addresses", showV6, toggleShowV6)}
				{toggleRow("Link-local addresses", showLinkLocal, toggleShowLinkLocal)}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}
```

- [ ] **Step 4: Implement `src/renderer/components/ExportMenu.tsx`**

```tsx
import { Button, DropdownMenu } from "@radix-ui/themes";
import { exportAs } from "../lib/commands";
import { Download } from "../lib/icons";

const OPTIONS: { kind: "json" | "csv" | "txt"; ext: string; label: string }[] = [
	{ kind: "json", ext: "JSON", label: "Export as JSON" },
	{ kind: "csv", ext: "CSV", label: "Export as CSV" },
	{ kind: "txt", ext: "TXT", label: "Copy as text" },
];

export function ExportMenu() {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				<Button color="indigo" variant="solid" size="2">
					<Download />
					Export
					<DropdownMenu.TriggerIcon />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content style={{ width: 180 }}>
				{OPTIONS.map((o) => (
					<DropdownMenu.Item key={o.kind} onSelect={() => void exportAs(o.kind)}>
						<span style={{ fontFamily: "var(--code-font-family)", fontSize: 10, fontWeight: 700, color: "var(--gray-10)", width: 30 }}>{o.ext}</span>
						{o.label}
					</DropdownMenu.Item>
				))}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	);
}
```

- [ ] **Step 5: Wire into `Toolbar.tsx`**

Remove the `Download`/`Sun` placeholder `Button`/comments as needed: replace `{/* TODO(Task 7): <ViewMenu /> */}` with `<ViewMenu />` (before the theme button) and replace the placeholder Export `<Button>` (and its `{/* TODO(Task 7): <ExportMenu /> */}`) with `<ExportMenu />`. Drop the now-unused `Button`/`Download` imports from `Toolbar.tsx`.

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint`
Expected: PASS / clean. If a menu test cannot see portalled content under happy-dom, assert via the store after firing the trigger+item with `findByText` (already used); do not switch test runners.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/ViewMenu.tsx src/renderer/components/ExportMenu.tsx src/renderer/components/Toolbar.tsx src/renderer/components/ViewMenu.test.tsx src/renderer/components/ExportMenu.test.tsx
git commit -m "feat(ui): view-options + export dropdown menus"
```

---

### Task 8: ListPane + tree row primitives + Services & Hosts lenses

**Files:**
- Create: `src/renderer/components/ListPane.tsx`, `src/renderer/components/ListPane.module.css`, `src/renderer/components/rows/TreeRows.tsx`, `src/renderer/components/rows/Rows.module.css`, `src/renderer/components/lenses/ServicesLens.tsx`, `src/renderer/components/lenses/HostsLens.tsx`
- Modify: `src/renderer/App.tsx` (render `<ListPane/>` into `.bcn-list-pane`)
- Test: `src/renderer/components/ListPane.test.tsx`, `src/renderer/components/lenses/ServicesLens.test.tsx`

**Interfaces:**
- Produces:
  - `TreeRows.tsx`: `TreeGroupRow({ group, onToggle, onSelect }: { group: TreeGroup; onToggle: (e: MouseEvent) => void; onSelect: () => void })`; `TreeChildRow({ child, onSelect }: { child: TreeChild; onSelect: () => void })`; `NewBadge()`, `LeftBadge()`.
  - `ServicesLens({ groups }: { groups: TreeGroup[] })`, `HostsLens({ groups }: { groups: TreeGroup[] })`.
  - `ListPane()` — builds the active lens view-model, renders the header (title + count + expand/collapse), the `.bcn-scroll` body, and the active lens.
- Consumes: `lib/selectors` builders + `SelectorCtx`; stores; `lib/icons` (`DisclosureDown`, `DisclosureRight`, `ExpandAll`, `CollapseAll`).
- A shared hook is convenient: add `useSelectorCtx(): { ctx: SelectorCtx; visible: Instance[] }` inside `ListPane.tsx` (not exported) that assembles `ctx` from both stores and computes `visibleInstances` once.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/renderer/components/lenses/ServicesLens.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { ServicesLens } from "./ServicesLens";

const groups: TreeGroup[] = [
	{
		id: "svc:_airplay._tcp", title: "_airplay._tcp", subtitle: "AirPlay", count: 1, proto: "TCP", chip: null, expanded: true,
		selected: false,
		children: [{ id: "k", title: "Mac Studio", subtitle: "Mac.local.", chip: "10.0.0.2", port: 7000, isNew: false, isLeft: false, selected: false }],
	},
];

beforeEach(() => useDiscoveryStore.setState({ selection: null, expanded: new Set() }));

describe("ServicesLens", () => {
	it("renders groups + expanded children", () => {
		render(<Theme><ServicesLens groups={groups} /></Theme>);
		expect(screen.getByText("_airplay._tcp")).toBeTruthy();
		expect(screen.getByText("Mac Studio")).toBeTruthy();
		expect(screen.getByText("TCP")).toBeTruthy();
	});
	it("selects the service type when the group row is clicked", () => {
		render(<Theme><ServicesLens groups={groups} /></Theme>);
		fireEvent.click(screen.getByText("_airplay._tcp"));
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "svc", id: "_airplay._tcp" });
	});
	it("selects the instance when a child is clicked", () => {
		render(<Theme><ServicesLens groups={groups} /></Theme>);
		fireEvent.click(screen.getByText("Mac Studio"));
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "inst", id: "k" });
	});
});
```

```tsx
// src/renderer/components/ListPane.test.tsx
import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { ListPane } from "./ListPane";

const h: Host = { id: "mac", displayName: "Mac", hostname: "Mac.local.", addresses: [{ value: "10.0.0.2", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true };
const i: Instance = { key: "k", name: "Mac", serviceType: "_ssh._tcp", protocol: "tcp", port: 22, txt: {}, hostId: "mac", firstSeen: 0, lastSeen: 0, present: true };

beforeEach(() => {
	useDiscoveryStore.setState({ hosts: new Map([["mac", h]]), instances: new Map([["k", i]]), query: "", expanded: new Set(), selection: null, now: 0 });
	useSettingsStore.setState({ mode: "service", showDesc: true, showV6: true, showLinkLocal: true, sortBy: "name" });
});

describe("ListPane header", () => {
	it("shows the lens title and count", () => {
		render(<Theme><ListPane /></Theme>);
		expect(screen.getByText("Services")).toBeTruthy();
		expect(screen.getByText("1 service types")).toBeTruthy();
	});
	it("updates when the lens changes", () => {
		useSettingsStore.setState({ mode: "host" });
		render(<Theme><ListPane /></Theme>);
		expect(screen.getByText("Hosts")).toBeTruthy();
		expect(screen.getByText("1 hosts")).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `pnpm vitest run src/renderer/components/ListPane.test.tsx src/renderer/components/lenses/ServicesLens.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `src/renderer/components/rows/TreeRows.tsx` + `Rows.module.css`**

```tsx
import type { MouseEvent } from "react";
import type { TreeChild, TreeGroup } from "../../lib/selectors";
import { DisclosureDown, DisclosureRight } from "../../lib/icons";
import styles from "./Rows.module.css";

export function NewBadge() {
	return <span className={styles.newBadge}>NEW</span>;
}
export function LeftBadge() {
	return <span className={styles.leftBadge}>LEFT</span>;
}

export function TreeGroupRow({ group, onToggle, onSelect }: { group: TreeGroup; onToggle: (e: MouseEvent) => void; onSelect: () => void }) {
	return (
		<button type="button" className={styles.groupRow} data-selected={group.selected || undefined} onClick={onSelect}>
			<span className={styles.disclosure} onClick={onToggle} aria-hidden>
				{group.expanded ? <DisclosureDown /> : <DisclosureRight />}
			</span>
			<span className={styles.titleBlock}>
				<span className={styles.groupTitle}>{group.title}</span>
				{group.subtitle && <span className={styles.subtitle}>{group.subtitle}</span>}
			</span>
			{group.chip && <span className={styles.grayChip}>{group.chip}</span>}
			{group.proto && <span className={styles.proto}>{group.proto}</span>}
			<span className={styles.countPill}>{group.count}</span>
		</button>
	);
}

export function TreeChildRow({ child, onSelect }: { child: TreeChild; onSelect: () => void }) {
	return (
		<button type="button" className={styles.childRow} data-selected={child.selected || undefined} onClick={onSelect}>
			<span className={styles.childCol}>
				<span className={styles.line1}>
					<span className={styles.childTitle}>{child.title}</span>
					{child.isNew && <NewBadge />}
					{child.isLeft && <LeftBadge />}
				</span>
				{child.subtitle && <span className={styles.childSub}>{child.subtitle}</span>}
			</span>
			{child.chip && <span className={styles.accentChip}>{child.chip}</span>}
			{child.port > 0 && <span className={styles.port}>:{child.port}</span>}
		</button>
	);
}
```

```css
/* Rows.module.css — values from the prototype "comfortable" set */
.groupRow,
.childRow {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: var(--row-h);
	border-radius: 7px;
	background: transparent;
	border: 0;
	cursor: pointer;
	color: var(--gray-12);
	text-align: left;
}
.groupRow {
	margin-bottom: 1px;
}
.groupRow:hover,
.childRow:hover {
	background: var(--gray-a3);
}
.groupRow[data-selected] {
	background: var(--accent-a3);
}
.childRow {
	margin-left: 24px;
	padding: 3px 8px 3px 12px;
}
.childRow[data-selected] {
	background: var(--accent-a4);
	box-shadow: inset 2.5px 0 0 var(--accent-9);
}
.disclosure {
	width: 22px;
	height: 22px;
	margin-left: 2px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 5px;
	color: var(--gray-9);
}
.disclosure:hover {
	color: var(--gray-12);
}
.titleBlock {
	flex: 1;
	min-width: 0;
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding-right: 8px;
}
.groupTitle {
	font-family: var(--code-font-family);
	font-size: var(--list-fs);
	font-weight: 600;
	color: var(--gray-12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.subtitle {
	font-size: 11.5px;
	color: var(--gray-10);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.childCol {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.line1 {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
.childTitle {
	font-size: var(--list-fs);
	font-weight: 550;
	color: var(--gray-12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.childSub {
	font-family: var(--code-font-family);
	font-size: 11px;
	color: var(--gray-10);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.grayChip,
.accentChip {
	font-family: var(--code-font-family);
	font-size: 11px;
	padding: 1px 6px;
	border-radius: 5px;
	margin-right: 6px;
	white-space: nowrap;
}
.grayChip {
	color: var(--gray-11);
	background: var(--gray-a3);
}
.accentChip {
	color: var(--accent-11);
	background: var(--accent-a2);
}
.proto {
	font-size: 9.5px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: var(--gray-10);
	margin-right: 6px;
}
.port {
	font-family: var(--code-font-family);
	font-size: 10.5px;
	color: var(--gray-10);
	margin-right: 10px;
}
.countPill {
	min-width: 20px;
	text-align: center;
	font-size: 10.5px;
	padding: 1px 6px;
	border-radius: 20px;
	background: var(--gray-a4);
	color: var(--gray-11);
	margin-right: 8px;
	font-variant-numeric: tabular-nums;
}
.newBadge {
	font-size: 9px;
	font-weight: 750;
	letter-spacing: 0.05em;
	color: var(--green-11);
	background: var(--green-a3);
	padding: 1px 5px;
	border-radius: 4px;
}
.leftBadge {
	font-size: 9px;
	font-weight: 700;
	letter-spacing: 0.04em;
	color: var(--gray-10);
	border: 1px solid var(--gray-a6);
	padding: 0 5px;
	border-radius: 4px;
}
```

- [ ] **Step 4: Implement the two lenses**

```tsx
// src/renderer/components/lenses/ServicesLens.tsx
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { TreeChildRow, TreeGroupRow } from "../rows/TreeRows";

export function ServicesLens({ groups }: { groups: TreeGroup[] }) {
	const toggleExpand = useDiscoveryStore((s) => s.toggleExpand);
	const selectSvc = useDiscoveryStore((s) => s.selectSvc);
	const selectInst = useDiscoveryStore((s) => s.selectInst);
	return (
		<>
			{groups.map((g) => (
				<div key={g.id}>
					<TreeGroupRow
						group={g}
						onToggle={(e) => {
							e.stopPropagation();
							toggleExpand(g.id);
						}}
						onSelect={() => selectSvc(g.id.slice("svc:".length))}
					/>
					{g.expanded && g.children.map((c) => <TreeChildRow key={c.id} child={c} onSelect={() => selectInst(c.id)} />)}
				</div>
			))}
		</>
	);
}
```

```tsx
// src/renderer/components/lenses/HostsLens.tsx
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { TreeChildRow, TreeGroupRow } from "../rows/TreeRows";

export function HostsLens({ groups }: { groups: TreeGroup[] }) {
	const toggleExpand = useDiscoveryStore((s) => s.toggleExpand);
	const selectHost = useDiscoveryStore((s) => s.selectHost);
	const selectInst = useDiscoveryStore((s) => s.selectInst);
	return (
		<>
			{groups.map((g) => (
				<div key={g.id}>
					<TreeGroupRow
						group={g}
						onToggle={(e) => {
							e.stopPropagation();
							toggleExpand(g.id);
						}}
						onSelect={() => selectHost(g.id.slice("host:".length))}
					/>
					{g.expanded && g.children.map((c) => <TreeChildRow key={c.id} child={c} onSelect={() => selectInst(c.id)} />)}
				</div>
			))}
		</>
	);
}
```

- [ ] **Step 5: Implement `src/renderer/components/ListPane.tsx` + `ListPane.module.css`**

```tsx
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useMemo } from "react";
import type { Instance } from "../../shared/types";
import {
	buildHostTree,
	buildServiceTree,
	type SelectorCtx,
	visibleInstances,
} from "../lib/selectors";
import { CollapseAll, ExpandAll } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { HostsLens } from "./lenses/HostsLens";
import { ServicesLens } from "./lenses/ServicesLens";
import styles from "./ListPane.module.css";

const TITLE = { service: "Services", host: "Hosts", ip: "Discovered IPs", all: "All Instances" } as const;

function useSelectorCtx(): { ctx: SelectorCtx; visible: Instance[] } {
	const hosts = useDiscoveryStore((s) => s.hosts);
	const instances = useDiscoveryStore((s) => s.instances);
	const query = useDiscoveryStore((s) => s.query);
	const expanded = useDiscoveryStore((s) => s.expanded);
	const selection = useDiscoveryStore((s) => s.selection);
	const now = useDiscoveryStore((s) => s.now);
	const showDesc = useSettingsStore((s) => s.showDesc);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);
	const sortBy = useSettingsStore((s) => s.sortBy);
	const ctx = useMemo<SelectorCtx>(
		() => ({ hosts, settings: { showDesc, showV6, showLinkLocal, sortBy }, query, expanded, selection, now }),
		[hosts, showDesc, showV6, showLinkLocal, sortBy, query, expanded, selection, now],
	);
	const visible = useMemo(() => visibleInstances([...instances.values()], hosts, query), [instances, hosts, query]);
	return { ctx, visible };
}

export function ListPane() {
	const mode = useSettingsStore((s) => s.mode);
	const expandAll = useDiscoveryStore((s) => s.expandAll);
	const collapseAll = useDiscoveryStore((s) => s.collapseAll);
	const { ctx, visible } = useSelectorCtx();

	const serviceGroups = useMemo(() => buildServiceTree(visible, ctx), [visible, ctx]);
	const hostGroups = useMemo(() => buildHostTree(visible, ctx), [visible, ctx]);

	const isTree = mode === "service" || mode === "host";
	let count = 0;
	let word = "";
	let body = null;
	if (mode === "service") {
		count = serviceGroups.length;
		word = "service types";
		body = <ServicesLens groups={serviceGroups} />;
	} else if (mode === "host") {
		count = hostGroups.length;
		word = "hosts";
		body = <HostsLens groups={hostGroups} />;
	} else {
		// ip / all lenses arrive in Tasks 9 & 10.
		word = mode === "ip" ? "addresses" : "instances";
	}

	const groupIds = () =>
		mode === "host"
			? [...new Set(visible.map((i) => `host:${i.hostId}`))]
			: [...new Set(visible.map((i) => `svc:${i.serviceType}`))];

	return (
		<>
			<div className={styles.header}>
				<span className={styles.title}>{TITLE[mode]}</span>
				<span className={styles.count}>
					{count} {word}
				</span>
				<span className={styles.spacer} />
				{isTree && (
					<>
						<Tooltip content="Expand all">
							<IconButton variant="ghost" size="1" aria-label="Expand all" onClick={() => expandAll(groupIds())}>
								<ExpandAll />
							</IconButton>
						</Tooltip>
						<Tooltip content="Collapse all">
							<IconButton variant="ghost" size="1" aria-label="Collapse all" onClick={() => collapseAll()}>
								<CollapseAll />
							</IconButton>
						</Tooltip>
					</>
				)}
			</div>
			<div className="bcn-scroll" style={{ padding: "6px 6px 14px" }}>
				{body}
			</div>
		</>
	);
}
```

```css
/* ListPane.module.css */
.header {
	flex: 0 0 auto;
	height: 40px;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 12px 0 14px;
	border-bottom: 1px solid var(--gray-a6);
}
.title {
	font-size: 13px;
	font-weight: 650;
	color: var(--gray-12);
}
.count {
	font-size: 11px;
	color: var(--gray-10);
	font-variant-numeric: tabular-nums;
}
.spacer {
	flex: 1;
}
```

- [ ] **Step 6: Mount `<ListPane/>` in `App.tsx`** — `<section className="bcn-list-pane"><ListPane /></section>`.

- [ ] **Step 7: Run tests + typecheck + lint**

Run: `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/ListPane.tsx src/renderer/components/ListPane.module.css src/renderer/components/rows src/renderer/components/lenses src/renderer/App.tsx src/renderer/components/ListPane.test.tsx
git commit -m "feat(ui): list pane + tree rows + services/hosts lenses"
```

---

### Task 9: Discovered IPs lens

**Files:**
- Create: `src/renderer/components/lenses/IpsLens.tsx`, `src/renderer/components/lenses/Ips.module.css`
- Modify: `src/renderer/components/ListPane.tsx` (add `buildIpGroups` memo + the `ip` branch)
- Test: `src/renderer/components/lenses/IpsLens.test.tsx`

**Interfaces:**
- Produces: `IpsLens({ groups }: { groups: IpGroup[] })`.
- Consumes: `IpGroup` from `lib/selectors`; `useDiscoveryStore.selectIp`; `lib/commands.copyText`; `lib/icons.Copy`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/lenses/IpsLens.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { IpsLens } from "./IpsLens";

const groups: IpGroup[] = [
	{ family: "ipv4", label: "IPv4", count: 1, addresses: [{ id: "mac|10.0.0.2", ip: "10.0.0.2", hostName: "Mac", ports: [22, 7000], selected: false }] },
];

beforeEach(() => useDiscoveryStore.setState({ selection: null, toast: null }));

describe("IpsLens", () => {
	it("renders the family header, ip, host, and ports", () => {
		render(<Theme><IpsLens groups={groups} /></Theme>);
		expect(screen.getByText("IPv4")).toBeTruthy();
		expect(screen.getByText("10.0.0.2")).toBeTruthy();
		expect(screen.getByText("Mac")).toBeTruthy();
		expect(screen.getByText("22")).toBeTruthy();
	});
	it("selects the ip on row click and copies on the copy button", () => {
		Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
		render(<Theme><IpsLens groups={groups} /></Theme>);
		fireEvent.click(screen.getByText("10.0.0.2"));
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "ip", id: "mac|10.0.0.2" });
		fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("10.0.0.2");
	});
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm vitest run src/renderer/components/lenses/IpsLens.test.tsx` → FAIL.

- [ ] **Step 3: Implement `IpsLens.tsx` + `Ips.module.css`**

```tsx
import type { IpGroup } from "../../lib/selectors";
import { copyText } from "../../lib/commands";
import { Copy } from "../../lib/icons";
import { useDiscoveryStore } from "../../store/discoveryStore";
import styles from "./Ips.module.css";

export function IpsLens({ groups }: { groups: IpGroup[] }) {
	const selectIp = useDiscoveryStore((s) => s.selectIp);
	return (
		<>
			{groups.map((g) => (
				<div key={g.family} className={styles.group}>
					<div className={styles.groupHeader}>
						<span className={styles.swatch} data-family={g.family} />
						<span className={styles.groupLabel}>{g.label}</span>
						<span className={styles.groupCount}>{g.count}</span>
					</div>
					{g.addresses.map((a) => (
						<button key={a.id} type="button" className={styles.row} data-selected={a.selected || undefined} onClick={() => selectIp(a.id)}>
							<span className={styles.col}>
								<span className={styles.ip}>{a.ip}</span>
								<span className={styles.host}>{a.hostName}</span>
							</span>
							{a.ports.length > 0 && (
								<span className={styles.ports}>
									{a.ports.map((p) => (
										<span key={p} className={styles.portChip}>
											{p}
										</span>
									))}
								</span>
							)}
							<span
								className={styles.copy}
								role="button"
								aria-label="Copy address"
								tabIndex={0}
								onClick={(e) => {
									e.stopPropagation();
									void copyText(a.ip, a.ip);
								}}
							>
								<Copy />
							</span>
						</button>
					))}
				</div>
			))}
		</>
	);
}
```

```css
/* Ips.module.css */
.group {
	margin-bottom: 8px;
}
.groupHeader {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 4px 8px 5px;
}
.swatch {
	width: 7px;
	height: 7px;
	border-radius: 2px;
}
.swatch[data-family="ipv4"] { background: var(--green-9); }
.swatch[data-family="ipv6"] { background: var(--accent-9); }
.swatch[data-family="linklocal"] { background: var(--amber-9); }
.swatch[data-family="loopback"] { background: var(--gray-8); }
.groupLabel {
	font-size: 11px;
	font-weight: 650;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--gray-11);
}
.groupCount {
	font-size: 10.5px;
	color: var(--gray-10);
	font-variant-numeric: tabular-nums;
}
.row {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: var(--row-h);
	border-radius: 7px;
	border: 0;
	background: transparent;
	cursor: pointer;
	padding: 4px 8px 4px 12px;
	text-align: left;
}
.row:hover {
	background: var(--gray-a3);
}
.row[data-selected] {
	background: var(--accent-a3);
}
.col {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.ip {
	font-family: var(--code-font-family);
	font-size: 13px;
	font-weight: 600;
	color: var(--gray-12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.host {
	font-size: 11px;
	color: var(--gray-10);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.ports {
	display: flex;
	gap: 3px;
	margin-right: 6px;
}
.portChip {
	font-family: var(--code-font-family);
	font-size: 10px;
	color: var(--gray-11);
	background: var(--gray-a3);
	padding: 1px 5px;
	border-radius: 4px;
}
.copy {
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 6px;
	color: var(--gray-9);
	cursor: pointer;
}
.copy:hover {
	background: var(--gray-a5);
	color: var(--gray-12);
}
```

- [ ] **Step 4: Wire the `ip` branch in `ListPane.tsx`**

Add the import `import { buildIpGroups } from "../lib/selectors";` and `import { IpsLens } from "./lenses/IpsLens";`, a memo `const ipGroups = useMemo(() => buildIpGroups(visible, ctx), [visible, ctx]);`, and replace the `ip` arm of the branch:

```tsx
} else if (mode === "ip") {
	count = ipGroups.reduce((n, g) => n + g.addresses.length, 0);
	word = "addresses";
	body = <IpsLens groups={ipGroups} />;
} else {
	word = "instances"; // all lens arrives in Task 10
}
```

- [ ] **Step 5: Run tests + typecheck + lint** — `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint` → PASS/clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/lenses/IpsLens.tsx src/renderer/components/lenses/Ips.module.css src/renderer/components/ListPane.tsx src/renderer/components/lenses/IpsLens.test.tsx
git commit -m "feat(ui): discovered IPs lens"
```

---

### Task 10: All Instances lens

**Files:**
- Create: `src/renderer/components/rows/FlatRow.tsx`, `src/renderer/components/lenses/AllLens.tsx`
- Modify: `src/renderer/components/ListPane.tsx` (add `buildFlat` memo + the `all` branch)
- Test: `src/renderer/components/lenses/AllLens.test.tsx`

**Interfaces:**
- Produces: `FlatRowItem({ row, onSelect }: { row: FlatRow; onSelect: () => void })`; `AllLens({ rows }: { rows: FlatRow[] })`.
- Consumes: `FlatRow` from `lib/selectors`; `useDiscoveryStore.selectInst`; row CSS from `rows/Rows.module.css` + a small `FlatRow.module.css`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/lenses/AllLens.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { FlatRow } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { AllLens } from "./AllLens";

const rows: FlatRow[] = [{ id: "k", name: "Mac Studio", serviceType: "_ssh._tcp", chip: "10.0.0.2", port: 22, isNew: true, isLeft: false, selected: false }];

beforeEach(() => useDiscoveryStore.setState({ selection: null }));

describe("AllLens", () => {
	it("renders name, service type, chip, port, and NEW badge; selects on click", () => {
		render(<Theme><AllLens rows={rows} /></Theme>);
		expect(screen.getByText("Mac Studio")).toBeTruthy();
		expect(screen.getByText("_ssh._tcp")).toBeTruthy();
		expect(screen.getByText("NEW")).toBeTruthy();
		fireEvent.click(screen.getByText("Mac Studio"));
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "inst", id: "k" });
	});
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm vitest run src/renderer/components/lenses/AllLens.test.tsx` → FAIL.

- [ ] **Step 3: Implement `FlatRow.tsx` + `FlatRow.module.css`**

```tsx
import type { FlatRow } from "../../lib/selectors";
import { LeftBadge, NewBadge } from "./TreeRows";
import styles from "./FlatRow.module.css";

export function FlatRowItem({ row, onSelect }: { row: FlatRow; onSelect: () => void }) {
	return (
		<button type="button" className={styles.row} data-selected={row.selected || undefined} onClick={onSelect}>
			<span className={styles.col}>
				<span className={styles.line1}>
					<span className={styles.name}>{row.name}</span>
					{row.isNew && <NewBadge />}
					{row.isLeft && <LeftBadge />}
				</span>
				<span className={styles.type}>{row.serviceType}</span>
			</span>
			{row.chip && <span className={styles.chip}>{row.chip}</span>}
			{row.port > 0 && <span className={styles.port}>:{row.port}</span>}
		</button>
	);
}
```

```css
/* FlatRow.module.css */
.row {
	display: flex;
	align-items: center;
	width: 100%;
	min-height: var(--row-h);
	border-radius: 7px;
	border: 0;
	background: transparent;
	cursor: pointer;
	padding: 4px 8px 4px 12px;
	text-align: left;
}
.row:hover {
	background: var(--gray-a3);
}
.row[data-selected] {
	background: var(--accent-a3);
}
.col {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.line1 {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}
.name {
	font-size: var(--list-fs);
	font-weight: 550;
	color: var(--gray-12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.type {
	font-family: var(--code-font-family);
	font-size: 11px;
	color: var(--gray-10);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.chip {
	font-family: var(--code-font-family);
	font-size: 11px;
	color: var(--accent-11);
	background: var(--accent-a2);
	padding: 1px 6px;
	border-radius: 5px;
	margin-right: 6px;
}
.port {
	font-family: var(--code-font-family);
	font-size: 10.5px;
	color: var(--gray-10);
	margin-right: 8px;
}
```

```tsx
// src/renderer/components/lenses/AllLens.tsx
import type { FlatRow } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { FlatRowItem } from "../rows/FlatRow";

export function AllLens({ rows }: { rows: FlatRow[] }) {
	const selectInst = useDiscoveryStore((s) => s.selectInst);
	return (
		<>
			{rows.map((r) => (
				<FlatRowItem key={r.id} row={r} onSelect={() => selectInst(r.id)} />
			))}
		</>
	);
}
```

- [ ] **Step 4: Wire the `all` branch in `ListPane.tsx`**

Add `import { buildFlat } from "../lib/selectors";` and `import { AllLens } from "./lenses/AllLens";`, a memo `const flatRows = useMemo(() => buildFlat(visible, ctx), [visible, ctx]);`, and replace the trailing `else` with:

```tsx
} else {
	count = flatRows.length;
	word = "instances";
	body = <AllLens rows={flatRows} />;
}
```

- [ ] **Step 5: Run tests + typecheck + lint** — `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint` → PASS/clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/rows/FlatRow.tsx src/renderer/components/rows/FlatRow.module.css src/renderer/components/lenses/AllLens.tsx src/renderer/components/ListPane.tsx src/renderer/components/lenses/AllLens.test.tsx
git commit -m "feat(ui): all-instances lens"
```

---

### Task 11: Detail pane (model-driven renderer + sections)

> **Decomposition note:** The File Structure listed per-kind detail components, but `buildDetail` (Task 5) already encodes every per-kind difference in one `DetailModel`. This task therefore implements a single model-driven `DetailPane` plus a `detail/sections.tsx` module, superseding the `detail/InstanceDetail.tsx`/etc. entries. This is the same data, fewer near-duplicate files.

**Files:**
- Create: `src/renderer/components/DetailPane.tsx`, `src/renderer/components/detail/sections.tsx`, `src/renderer/components/detail/Detail.module.css`
- Modify: `src/renderer/App.tsx` (render `<DetailPane/>` into `.bcn-detail-pane`)
- Test: `src/renderer/components/DetailPane.test.tsx`

**Interfaces:**
- Produces: `DetailPane()` (no props). Section components in `sections.tsx`: `EmptyDetail`, `DetailHeader`, `AddressBlock`, `MetaTable`, `ServicesList`, `HostsList`, `TxtSection` — each taking the relevant slice of `DetailModel`.
- Consumes: `buildDetail`, `DetailModel`, `DetailCtx` from `lib/detail`; stores; `lib/commands` (`runDetailAction`, `copyText`, `revealHost`); `lib/icons`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/DetailPane.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { DetailPane } from "./DetailPane";

const h: Host = { id: "mac", displayName: "Mac Studio", hostname: "Mac.local.", addresses: [{ value: "10.0.0.2", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true };
const web: Instance = { key: "web", name: "Mac Studio", serviceType: "_http._tcp", protocol: "tcp", port: 80, txt: { path: "/" }, hostId: "mac", firstSeen: 0, lastSeen: 0, present: true };

beforeEach(() => {
	window.beacon = { openExternal: vi.fn().mockResolvedValue(undefined), setLive: vi.fn(), rescan: vi.fn(), resolve: vi.fn(), getSnapshot: vi.fn(), onSnapshot: vi.fn(), onDelta: vi.fn(), onStatus: vi.fn() } as unknown as typeof window.beacon;
	useSettingsStore.setState({ showDesc: true, showV6: true, showLinkLocal: true });
	useDiscoveryStore.setState({ hosts: new Map([["mac", h]]), instances: new Map([["web", web]]), query: "", now: 0, selection: null });
});

describe("DetailPane", () => {
	it("shows the empty state with no selection", () => {
		render(<Theme><DetailPane /></Theme>);
		expect(screen.getByText("Select an item to see details")).toBeTruthy();
	});
	it("renders an instance detail and opens the browser action", () => {
		useDiscoveryStore.setState({ selection: { kind: "inst", id: "web" } });
		render(<Theme><DetailPane /></Theme>);
		expect(screen.getByText("Live")).toBeTruthy();
		expect(screen.getByText("Service type")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Open in Browser" }));
		expect(window.beacon.openExternal).toHaveBeenCalledWith("http://10.0.0.2:80");
	});
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm vitest run src/renderer/components/DetailPane.test.tsx` → FAIL.

- [ ] **Step 3: Implement `src/renderer/components/detail/sections.tsx`**

```tsx
import { Button } from "@radix-ui/themes";
import type { DetailAction, DetailAddrGroup, DetailModel, MetaRow, ServiceRow, AdvertisedHost, TxtRow } from "../../lib/detail";
import { copyText, revealHost, runDetailAction } from "../../lib/commands";
import { ChevronRight, Copy, ExtLink, ModeHost, ModeInstance, ModeIp, ModeService, Radar, RevealHost, Resolve } from "../../lib/icons";
import { useDiscoveryStore } from "../../store/discoveryStore";
import styles from "./Detail.module.css";

const KIND_ICON = { instance: ModeInstance, host: ModeHost, service: ModeService, ip: ModeIp };
const ACTION_ICON = { ext: ExtLink, copy: Copy, resolve: Resolve, reveal: RevealHost };

export function EmptyDetail() {
	return (
		<div className={styles.empty}>
			<Radar />
			<span>Select an item to see details</span>
		</div>
	);
}

function ActionButtons({ actions }: { actions: DetailAction[] }) {
	if (actions.length === 0) return null;
	return (
		<div className={styles.actions}>
			{actions.map((a) => {
				const Icon = ACTION_ICON[a.icon];
				return (
					<Button
						key={a.id}
						size="2"
						variant={a.primary ? "solid" : "soft"}
						color={a.primary ? "indigo" : "gray"}
						onClick={() => runDetailAction(a)}
					>
						<Icon />
						{a.label}
					</Button>
				);
			})}
		</div>
	);
}

export function DetailHeader({ detail }: { detail: DetailModel }) {
	const Icon = KIND_ICON[detail.kind];
	return (
		<div className={styles.header}>
			<div className={styles.headRow}>
				<span className={styles.iconTile}>
					<Icon size={19} />
				</span>
				<span className={styles.nameWrap}>
					<span className={detail.nameMono ? styles.nameMono : styles.name}>{detail.name}</span>
					{detail.status &&
						(detail.status.live ? (
							<span className={styles.statusLive}>
								<span className={styles.statusDot} />
								{detail.status.label}
							</span>
						) : (
							<span className={styles.statusOff}>{detail.status.label}</span>
						))}
				</span>
			</div>
			{detail.sub && <div className={styles.sub}>{detail.sub}</div>}
			{detail.serviceDesc && <div className={styles.serviceDesc}>{detail.serviceDesc}</div>}
			<ActionButtons actions={detail.actions} />
		</div>
	);
}

export function AddressBlock({ title, groups }: { title?: string; groups: DetailAddrGroup[] }) {
	if (groups.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{groups.map((g) => (
				<div key={g.family} className={styles.addrGroup}>
					<div className={styles.addrGroupHead}>
						<span className={styles.swatch} data-family={g.family} />
						{g.label}
					</div>
					{g.addresses.map((a) => (
						<button key={a.copyValue} type="button" className={styles.addrRow} onClick={() => void copyText(a.copyValue, a.copyValue)}>
							<span className={styles.addrIp}>
								{a.ip}
								{a.endpoint && <span className={styles.addrPort}>{a.portText}</span>}
							</span>
							<Copy />
						</button>
					))}
				</div>
			))}
		</section>
	);
}

export function MetaTable({ rows }: { rows: MetaRow[] }) {
	if (rows.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>Details</div>
			<div className={styles.metaTable}>
				{rows.map((m) => (
					<div key={m.label} className={styles.metaRow}>
						<span className={styles.metaKey}>{m.label}</span>
						{m.link ? (
							<button type="button" className={styles.metaLink} onClick={() => revealHost(m.link!.hostId)}>
								{m.value}
							</button>
						) : (
							<span className={m.font === "mono" ? styles.metaValMono : styles.metaVal}>{m.value}</span>
						)}
						{m.copyable && (
							<span className={styles.metaCopy} role="button" aria-label={`Copy ${m.label}`} tabIndex={0} onClick={() => void copyText(m.value, m.value)}>
								<Copy />
							</span>
						)}
					</div>
				))}
			</div>
		</section>
	);
}

export function ServicesList({ title, rows }: { title?: string; rows: ServiceRow[] }) {
	if (!title || rows.length === 0) return null;
	return <CardList title={title} rows={rows.map((r) => ({ id: r.id, title: r.title, sub: r.subtitle, port: r.port, mono: true }))} />;
}

export function HostsList({ title, rows }: { title?: string; rows: AdvertisedHost[] }) {
	if (!title || rows.length === 0) return null;
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{rows.map((hrow) => (
				<button key={hrow.id} type="button" className={styles.card} onClick={() => useDiscoveryStore.getState().selectInst(hrow.id)}>
					<span className={styles.cardCol}>
						<span className={styles.cardTitle}>{hrow.name}</span>
						<span className={styles.cardSubMono}>{hrow.sub}</span>
					</span>
					{hrow.chip && <span className={styles.accentChip}>{hrow.chip}</span>}
				</button>
			))}
		</section>
	);
}

function CardList({ title, rows }: { title: string; rows: { id: string; title: string; sub?: string; port: number; mono: boolean }[] }) {
	return (
		<section className={styles.section}>
			<div className={styles.sectionLabel}>{title}</div>
			{rows.map((r) => (
				<button key={r.id} type="button" className={styles.card} onClick={() => useDiscoveryStore.getState().selectInst(r.id)}>
					<span className={styles.cardCol}>
						<span className={r.mono ? styles.cardTitleMono : styles.cardTitle}>{r.title}</span>
						{r.sub && <span className={styles.cardSub}>{r.sub}</span>}
					</span>
					{r.port > 0 && <span className={styles.cardPort}>:{r.port}</span>}
					<ChevronRight />
				</button>
			))}
		</section>
	);
}

export function TxtSection({ detail }: { detail: DetailModel }) {
	if (detail.noTxt) return <div className={styles.noTxt}>No TXT records advertised</div>;
	if (!detail.hasTxt) return null;
	return (
		<section className={styles.section}>
			<div className={styles.txtHead}>
				<span className={styles.sectionLabel}>TXT Records</span>
				<span className={styles.txtCount}>{detail.txtTitle}</span>
			</div>
			<div className={styles.txtTable}>
				{detail.txt.map((t: TxtRow) => (
					<div key={t.key} className={styles.txtRow}>
						<span className={styles.txtKey}>{t.key}</span>
						<span className={styles.txtVal}>{t.value}</span>
						<span className={styles.metaCopy} role="button" aria-label={`Copy ${t.key}`} tabIndex={0} onClick={() => void copyText(`${t.key}=${t.value}`, `${t.key}=${t.value}`)}>
							<Copy />
						</span>
					</div>
				))}
			</div>
		</section>
	);
}
```

- [ ] **Step 4: Implement `src/renderer/components/DetailPane.tsx`**

```tsx
import { useMemo } from "react";
import { buildDetail, type DetailCtx } from "../lib/detail";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { AddressBlock, DetailHeader, EmptyDetail, HostsList, MetaTable, ServicesList, TxtSection } from "./detail/sections";

export function DetailPane() {
	const instances = useDiscoveryStore((s) => s.instances);
	const hosts = useDiscoveryStore((s) => s.hosts);
	const selection = useDiscoveryStore((s) => s.selection);
	const query = useDiscoveryStore((s) => s.query);
	const now = useDiscoveryStore((s) => s.now);
	const showDesc = useSettingsStore((s) => s.showDesc);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);

	const detail = useMemo(() => {
		const ctx: DetailCtx = { instances, hosts, settings: { showDesc, showV6, showLinkLocal }, query, now };
		return buildDetail(selection, ctx);
	}, [instances, hosts, selection, query, now, showDesc, showV6, showLinkLocal]);

	if (!detail) return <EmptyDetail />;
	return (
		<>
			<DetailHeader detail={detail} />
			<div className="bcn-scroll" style={{ padding: "6px 20px 24px" }}>
				<AddressBlock title={detail.addrTitle} groups={detail.addrGroups} />
				<MetaTable rows={detail.meta} />
				<ServicesList title={detail.servicesTitle} rows={detail.services} />
				<HostsList title={detail.hostsTitle} rows={detail.hosts} />
				<TxtSection detail={detail} />
			</div>
		</>
	);
}
```

- [ ] **Step 5: Implement `src/renderer/components/detail/Detail.module.css`**

Values from the visual spec §3 "DETAIL PANE SECTIONS". Key rules (the implementer fills remaining trivial properties to match):

```css
.empty {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	color: var(--gray-9);
	font-size: 13px;
}
.empty svg { opacity: 0.5; }

.header {
	flex: 0 0 auto;
	padding: 18px 20px 16px;
	border-bottom: 1px solid var(--gray-a6);
}
.headRow { display: flex; align-items: flex-start; gap: 13px; }
.iconTile {
	width: 38px;
	height: 38px;
	border-radius: 10px;
	background: var(--accent-a3);
	color: var(--accent-11);
	display: flex;
	align-items: center;
	justify-content: center;
}
.nameWrap { display: flex; align-items: center; gap: 9px; min-width: 0; }
.name, .nameMono {
	font-size: 17px;
	font-weight: 680;
	color: var(--gray-12);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.nameMono { font-family: var(--code-font-family); }
.statusLive {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 11px;
	font-weight: 600;
	color: var(--green-11);
	background: var(--green-a3);
	padding: 2px 8px;
	border-radius: 20px;
}
.statusDot { width: 6px; height: 6px; border-radius: 50%; background: var(--green-9); }
.statusOff {
	font-size: 11px;
	font-weight: 600;
	color: var(--gray-10);
	border: 1px solid var(--gray-a6);
	padding: 2px 8px;
	border-radius: 20px;
}
.sub { font-family: var(--code-font-family); font-size: 12px; color: var(--gray-10); margin-top: 3px; }
.serviceDesc { font-size: 12.5px; color: var(--gray-11); line-height: 1.45; margin-top: 7px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

.section { margin-top: 18px; }
.sectionLabel {
	font-size: 11px;
	font-weight: 650;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--gray-10);
	margin-bottom: 9px;
}
.addrGroup { margin-bottom: 10px; }
.addrGroupHead { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--gray-11); margin-bottom: 5px; }
.swatch { width: 6px; height: 6px; border-radius: 2px; }
.swatch[data-family="ipv4"] { background: var(--green-9); }
.swatch[data-family="ipv6"] { background: var(--accent-9); }
.swatch[data-family="linklocal"] { background: var(--amber-9); }
.swatch[data-family="loopback"] { background: var(--gray-8); }
.addrRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	gap: 10px;
	padding: 7px 9px;
	border-radius: 8px;
	background: var(--gray-a3);
	border: 1px solid var(--gray-a4);
	cursor: pointer;
	margin-bottom: 4px;
	color: var(--gray-9);
}
.addrRow:hover { background: var(--gray-a5); border-color: var(--gray-a6); }
.addrIp { font-family: var(--code-font-family); font-size: 12px; color: var(--gray-12); }
.addrPort { color: var(--accent-11); font-weight: 600; }

.metaTable { border: 1px solid var(--gray-a6); border-radius: 9px; overflow: hidden; }
.metaRow { display: flex; align-items: center; gap: 12px; min-height: 34px; padding: 5px 12px; border-bottom: 1px solid var(--gray-a4); }
.metaRow:last-child { border-bottom: 0; }
.metaKey { flex: 0 0 110px; font-size: 12px; color: var(--gray-10); }
.metaVal { font-size: 12.5px; color: var(--gray-12); }
.metaValMono { font-size: 12.5px; color: var(--gray-12); font-family: var(--code-font-family); }
.metaLink { font-size: 12.5px; font-weight: 550; color: var(--accent-11); background: none; border: 0; cursor: pointer; padding: 0; }
.metaLink:hover { text-decoration: underline; }
.metaCopy { color: var(--gray-9); cursor: pointer; display: inline-flex; margin-left: auto; }
.metaCopy:hover { color: var(--gray-12); }

.card {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 8px 10px;
	border-radius: 8px;
	border: 1px solid var(--gray-a6);
	background: transparent;
	cursor: pointer;
	margin-bottom: 4px;
	color: var(--gray-9);
	text-align: left;
}
.card:hover { background: var(--gray-a3); }
.cardCol { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cardTitle { font-size: 12.5px; font-weight: 600; color: var(--gray-12); }
.cardTitleMono { font-size: 12.5px; font-weight: 600; color: var(--gray-12); font-family: var(--code-font-family); }
.cardSub { font-size: 11.5px; color: var(--gray-10); }
.cardSubMono { font-size: 11px; color: var(--gray-10); font-family: var(--code-font-family); }
.cardPort { font-family: var(--code-font-family); font-size: 11px; color: var(--gray-10); }
.accentChip { font-family: var(--code-font-family); font-size: 11px; color: var(--accent-11); background: var(--accent-a2); padding: 1px 6px; border-radius: 5px; }

.txtHead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.txtCount { font-size: 10.5px; color: var(--gray-9); }
.txtTable { border: 1px solid var(--gray-a6); border-radius: 9px; overflow: hidden; }
.txtRow { display: flex; align-items: center; gap: 12px; min-height: 32px; padding: 5px 10px 5px 12px; border-bottom: 1px solid var(--gray-a4); }
.txtRow:last-child { border-bottom: 0; }
.txtKey { flex: 0 0 140px; font-family: var(--code-font-family); font-size: 11.5px; font-weight: 650; color: var(--accent-11); overflow: hidden; text-overflow: ellipsis; }
.txtVal { flex: 1; font-family: var(--code-font-family); font-size: 11.5px; color: var(--gray-12); word-break: break-all; }
.noTxt { margin-top: 18px; padding: 14px; border: 1px dashed var(--gray-a6); border-radius: 9px; text-align: center; font-size: 12px; color: var(--gray-9); }
```

- [ ] **Step 6: Mount `<DetailPane/>` in `App.tsx`** — `<section className="bcn-detail-pane"><DetailPane /></section>`.

- [ ] **Step 7: Run tests + typecheck + lint** — `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint` → PASS/clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/DetailPane.tsx src/renderer/components/detail src/renderer/App.tsx src/renderer/components/DetailPane.test.tsx
git commit -m "feat(ui): detail pane — header, addresses, meta, services, advertised-by, TXT"
```

---

### Task 12: Status bar + Toast

**Files:**
- Create: `src/renderer/components/StatusBar.tsx`, `src/renderer/components/StatusBar.module.css`, `src/renderer/components/Toast.tsx`, `src/renderer/components/Toast.module.css`
- Modify: `src/renderer/App.tsx` (render `<StatusBar/>` into `.bcn-status-bar`; render `<Toast/>` as the last child of `.bcn-app`)
- Test: `src/renderer/components/StatusBar.test.tsx`, `src/renderer/components/Toast.test.tsx`

**Interfaces:**
- Produces: `StatusBar()`, `Toast()` (no props).
- Consumes: `visibleInstances`, `lensCounts` from `lib/selectors`; `staleness`, `ageLabel` from `lib/presence`; stores; `lib/icons.ToastCheck`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/renderer/components/StatusBar.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { StatusBar } from "./StatusBar";

const h: Host = { id: "mac", displayName: "Mac", hostname: "Mac.local.", addresses: [{ value: "10.0.0.2", family: "ipv4" }], firstSeen: 0, lastSeen: 0, present: true };
const i: Instance = { key: "k", name: "Mac", serviceType: "_ssh._tcp", protocol: "tcp", port: 22, txt: {}, hostId: "mac", firstSeen: 0, lastSeen: 0, present: true };

beforeEach(() => {
	useSettingsStore.setState({ showV6: true, showLinkLocal: true, showDesc: true, sortBy: "name" });
	useDiscoveryStore.setState({ hosts: new Map([["mac", h]]), instances: new Map([["k", i]]), query: "", now: 0, pausedAt: 0, status: { live: true, scanning: false } });
});

describe("StatusBar", () => {
	it("shows Live and the counts while live", () => {
		render(<StatusBar />);
		expect(screen.getByText("Live")).toBeTruthy();
		expect(screen.getByText("1 hosts · 1 service types · 1 instances · 1 addresses")).toBeTruthy();
		expect(screen.getByText("Updated just now")).toBeTruthy();
	});
	it("shows a stale snapshot label when paused beyond the stale threshold", () => {
		useDiscoveryStore.setState({ status: { live: false, scanning: false }, pausedAt: 0, now: 15000 });
		render(<StatusBar />);
		expect(screen.getByText("Snapshot stale · 0:15 old")).toBeTruthy();
	});
});
```

```tsx
// src/renderer/components/Toast.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { Toast } from "./Toast";

beforeEach(() => useDiscoveryStore.setState({ toast: null }));

describe("Toast", () => {
	it("renders nothing when no toast", () => {
		const { container } = render(<Toast />);
		expect(container.firstChild).toBeNull();
	});
	it("renders the toast message", () => {
		useDiscoveryStore.setState({ toast: "Copied 10.0.0.2" });
		render(<Toast />);
		expect(screen.getByText("Copied 10.0.0.2")).toBeTruthy();
	});
});
```

- [ ] **Step 2: Run them to confirm they fail** — `pnpm vitest run src/renderer/components/StatusBar.test.tsx src/renderer/components/Toast.test.tsx` → FAIL.

- [ ] **Step 3: Implement `StatusBar.tsx` + `StatusBar.module.css`**

```tsx
import { useMemo } from "react";
import { ageLabel, staleness } from "../lib/presence";
import { lensCounts, visibleInstances } from "../lib/selectors";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
	const hosts = useDiscoveryStore((s) => s.hosts);
	const instances = useDiscoveryStore((s) => s.instances);
	const query = useDiscoveryStore((s) => s.query);
	const status = useDiscoveryStore((s) => s.status);
	const now = useDiscoveryStore((s) => s.now);
	const pausedAt = useDiscoveryStore((s) => s.pausedAt);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);

	const counts = useMemo(() => {
		const visible = visibleInstances([...instances.values()], hosts, query);
		return lensCounts(visible, { hosts, settings: { showDesc: true, showV6, showLinkLocal, sortBy: "name" }, query, expanded: new Set(), selection: null, now });
	}, [instances, hosts, query, showV6, showLinkLocal, now]);

	const pausedAgeS = status.live || pausedAt === 0 ? 0 : Math.floor((now - pausedAt) / 1000);
	const stale = staleness(status.live, pausedAgeS);
	const dotClass = status.live ? styles.dotLive : stale === "stale" ? styles.dotStale : styles.dotPaused;
	const label = status.live ? "Live" : "Paused";
	const updated = status.live
		? "Updated just now"
		: stale === "stale"
			? `Snapshot stale · ${ageLabel(pausedAgeS)} old`
			: `Paused · ${ageLabel(pausedAgeS)}`;

	return (
		<>
			<span className={`${styles.dot} ${dotClass}`} />
			<span className={styles.label}>{label}</span>
			<span className={styles.divider} />
			<span className={styles.counts}>
				{counts.hosts} hosts · {counts.services} service types · {counts.instances} instances · {counts.ips} addresses
			</span>
			<span className={styles.spacer} />
			<span className={styles.counts}>{updated}</span>
		</>
	);
}
```

```css
/* StatusBar.module.css */
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dotLive { background: var(--green-9); animation: bcn-liveplus 2s infinite; }
.dotPaused { background: var(--gray-8); }
.dotStale { background: var(--amber-9); animation: bcn-amberpulse 1.6s infinite; }
.label { color: var(--gray-11); font-weight: 550; }
.divider { width: 1px; height: 13px; background: var(--gray-a6); }
.counts { font-variant-numeric: tabular-nums; }
.spacer { flex: 1; }
```

- [ ] **Step 4: Implement `Toast.tsx` + `Toast.module.css`**

```tsx
import { useDiscoveryStore } from "../store/discoveryStore";
import { ToastCheck } from "../lib/icons";
import styles from "./Toast.module.css";

export function Toast() {
	const toast = useDiscoveryStore((s) => s.toast);
	if (!toast) return null;
	return (
		<div className={styles.toast} role="status">
			<span className={styles.check}>
				<ToastCheck />
			</span>
			{toast}
		</div>
	);
}
```

```css
/* Toast.module.css */
.toast {
	position: fixed;
	left: 50%;
	bottom: 34px;
	transform: translateX(-50%);
	z-index: 80;
	display: flex;
	align-items: center;
	gap: 9px;
	padding: 10px 16px;
	background: var(--gray-12);
	color: var(--gray-1);
	border-radius: 9px;
	box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5);
	font-size: 12.5px;
	font-weight: 550;
	animation: bcn-popin 0.16s ease;
}
.check { color: var(--green-9); display: flex; }
```

- [ ] **Step 5: Mount in `App.tsx`** — `<footer className="bcn-status-bar"><StatusBar /></footer>` and add `<Toast />` as the final child inside `.bcn-app`.

- [ ] **Step 6: Run tests + typecheck + lint** — `pnpm vitest run src/renderer/components && pnpm typecheck && pnpm lint` → PASS/clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/components/StatusBar.module.css src/renderer/components/Toast.tsx src/renderer/components/Toast.module.css src/renderer/App.tsx src/renderer/components/StatusBar.test.tsx src/renderer/components/Toast.test.tsx
git commit -m "feat(ui): status bar + toast"
```

---

### Task 13: Integration — main.tsx wiring, reactive theme/staleness, keyboard

**Files:**
- Create: `src/renderer/lib/keyboard.ts`
- Modify: `src/renderer/main.tsx` (wire `onStatus`, `getSnapshot` bootstrap, 1s clock, scan-complete toast, keyboard install, reactive `<Theme>` via a `<Root/>`)
- Modify: `src/renderer/App.tsx` (compute `data-staleness` from store instead of the literal `"fresh"`)
- Test: `src/renderer/lib/keyboard.test.ts`

**Interfaces:**
- Produces: `installKeyboard(): () => void` (attaches a `document` keydown listener per GC-8, returns a remover).
- Consumes: `lib/commands` (`toggleLive`, `rescan`); stores; `lib/presence` (`staleness`).

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/lib/keyboard.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { installKeyboard } from "./keyboard";

function key(init: KeyboardEventInit) {
	document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
}

beforeEach(() => {
	document.body.innerHTML = '<input id="beacon-search" />';
	window.beacon = { rescan: vi.fn().mockResolvedValue(undefined), setLive: vi.fn().mockResolvedValue(undefined), resolve: vi.fn(), openExternal: vi.fn(), getSnapshot: vi.fn(), onSnapshot: vi.fn(), onDelta: vi.fn(), onStatus: vi.fn() } as unknown as typeof window.beacon;
	useSettingsStore.setState({ mode: "service" });
	useDiscoveryStore.setState({ status: { live: true, scanning: false }, query: "" });
});

describe("installKeyboard", () => {
	it("number keys switch lenses and 'r' rescans", () => {
		const off = installKeyboard();
		key({ key: "2" });
		expect(useSettingsStore.getState().mode).toBe("host");
		key({ key: "r" });
		expect(window.beacon.rescan).toHaveBeenCalled();
		off();
	});
	it("'/' focuses the search field", () => {
		const off = installKeyboard();
		key({ key: "/" });
		expect(document.activeElement?.id).toBe("beacon-search");
		off();
	});
	it("removes its listener when disposed", () => {
		const off = installKeyboard();
		off();
		key({ key: "r" });
		expect(window.beacon.rescan).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it to confirm it fails** — `pnpm vitest run src/renderer/lib/keyboard.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/renderer/lib/keyboard.ts`**

```ts
import { rescan, toggleLive } from "./commands";
import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";

const LENS_KEYS: Record<string, Lens> = { "1": "service", "2": "host", "3": "ip", "4": "all" };

export function installKeyboard(): () => void {
	const onKey = (e: KeyboardEvent) => {
		const tag = (e.target as HTMLElement | null)?.tagName;
		const typing = tag === "INPUT" || tag === "TEXTAREA";

		if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
			e.preventDefault();
			document.getElementById("beacon-search")?.focus();
			return;
		}
		if (typing) {
			if (e.key === "Escape") {
				(e.target as HTMLElement).blur();
				if (useDiscoveryStore.getState().query) useDiscoveryStore.getState().clearSearch();
			}
			return;
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		if (e.key === " " || e.key === "p") {
			if (e.key === " " && (tag === "BUTTON" || tag === "A")) return;
			e.preventDefault();
			void toggleLive();
			return;
		}
		if (e.key === "r") void rescan();
		else {
			const lens = LENS_KEYS[e.key];
			if (lens) useSettingsStore.getState().setMode(lens);
		}
	};
	document.addEventListener("keydown", onKey);
	return () => document.removeEventListener("keydown", onKey);
}
```

- [ ] **Step 4: Update `App.tsx` to compute `data-staleness`**

Replace the hardcoded `data-staleness="fresh"` with a derived value:

```tsx
import { staleness } from "./lib/presence";
import { useDiscoveryStore } from "./store/discoveryStore";
// inside App():
const status = useDiscoveryStore((s) => s.status);
const now = useDiscoveryStore((s) => s.now);
const pausedAt = useDiscoveryStore((s) => s.pausedAt);
const stale = staleness(status.live, status.live || pausedAt === 0 ? 0 : Math.floor((now - pausedAt) / 1000));
// ...
<div className="bcn-app" data-staleness={stale} data-platform={isMac ? "mac" : undefined}>
```

- [ ] **Step 5: Rewrite `src/renderer/main.tsx`**

```tsx
import { Theme } from "@radix-ui/themes";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import "./styles/tokens.css";
import { App } from "./App";
import { installKeyboard } from "./lib/keyboard";
import { useDiscoveryStore } from "./store/discoveryStore";
import { useSettingsStore } from "./store/settingsStore";

const store = useDiscoveryStore.getState();
window.beacon.onSnapshot((snapshot) => store.applySnapshot(snapshot));
window.beacon.onDelta((delta) => store.applyDelta(delta));
window.beacon.onStatus((status) => store.applyStatus(status));
void window.beacon.getSnapshot().then((snapshot) => store.applySnapshot(snapshot));

// Toast when a rescan finishes (scanning true → false).
let prevScanning = false;
useDiscoveryStore.subscribe((s) => {
	if (prevScanning && !s.status.scanning) s.showToast("Rescan complete");
	prevScanning = s.status.scanning;
});

function Root() {
	const appearance = useSettingsStore((s) => s.appearance);
	useEffect(() => {
		useDiscoveryStore.getState().tick(Date.now());
		const clock = setInterval(() => useDiscoveryStore.getState().tick(Date.now()), 1000);
		const removeKeys = installKeyboard();
		return () => {
			clearInterval(clock);
			removeKeys();
		};
	}, []);
	return (
		<Theme appearance={appearance} accentColor="indigo" grayColor="slate" radius="medium">
			<App />
		</Theme>
	);
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
	<StrictMode>
		<Root />
	</StrictMode>,
);
```

- [ ] **Step 6: Run the full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS / clean (all renderer + main tests).

- [ ] **Step 7: Boot gate (manual, controller-run)**

The unit/component layer cannot prove the wired app renders. Launch it and confirm:
- `pnpm start` opens the window; the four segments switch lenses; search filters; clicking a row populates the detail pane; Pause dims the panels and the dot goes gray→amber; Rescan spins + toasts; Export downloads a JSON file; theme toggle flips dark/light.
- Verify on a live network (your LAN) that real services populate all four lenses and detail variants.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/main.tsx src/renderer/App.tsx src/renderer/lib/keyboard.ts src/renderer/lib/keyboard.test.ts
git commit -m "feat(ui): wire onStatus, clock, keyboard, reactive theme + staleness"
```

---

## Done criteria

All four lenses render live discovery; selection drives every detail variant; search filters and force-expands; live/pause dims with the staleness tint; rescan, resolve, copy, open-in-browser, and export all work; theme + lens + sort + show-toggles persist across restarts; `pnpm test`, `pnpm typecheck`, and `pnpm lint` are green; the boot gate passes on a live network. Packaging (forge makers, macOS Local Network Info.plist, packaged-build `require` re-verification) is **Plan 4**.
