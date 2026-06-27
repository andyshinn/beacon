# Beacon — mDNS / Bonjour Discovery Browser — Design Spec

**Date:** 2026-06-27
**Status:** Approved for planning
**Source design:** `docs/design/mdns-discovery-electron-app/project/Beacon.dc.html` (Claude Design handoff)

## 1. Summary

Beacon is a cross-platform Electron desktop app that browses the local network for
mDNS / Bonjour / DNS-SD services — like Apple's "Discovery" app or "Bonjour Browser",
but with additional lenses for viewing the same data by **host** and by **IP address**,
plus search. It continuously discovers services, hosts, and addresses; shows live
arrivals and departures; and presents rich per-item detail (addresses, ports, TXT
records, related services).

The build targets **full fidelity** to the `Beacon.dc.html` prototype. Behaviors the
prototype only simulates (Resolve, Open in Browser, Export, NEW/LEFT, staleness) get
real implementations.

**Stack:** Electron + electron-forge (Vite plugin) · React 19 + Radix UI Themes ·
`bonjour-service` for discovery · Vitest for tests. Packaged for macOS, Windows, Linux.

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Scope | Full design, faithfully — every prototype behavior implemented for real |
| Lens switcher | **Segmented control**, fixed. No sidebar/tabs, no layout-switcher prop |
| Theme controls | Drop density + accent pickers. Fix density = *comfortable*, accent = *indigo*. Keep dark/light toggle (default **dark**) |
| Departed items | Grey + **LEFT/Offline** badge, then auto-prune ~30s after departure |
| Persistence | **UI settings only** (appearance, view toggles, sort, last lens, window bounds). Re-discover fresh each launch; no snapshot cache |
| Distribution | Unsigned local builds for mac/win/linux. Defer signing, notarization, auto-update |
| Discovery engine | `bonjour-service` v1.4.2 wrapped in a main-process `DiscoveryManager` |
| IPv6 / interfaces | One udp4 + one udp6 engine on the default interface; dedupe by service name. Per-NIC coverage deferred |
| Renderer state | `zustand` store, fed by IPC deltas |
| macOS chrome | Native frame with `titleBarStyle: 'hiddenInset'`; standard frame on Windows/Linux |

## 3. mDNS engine

### 3.1 Why bonjour-service

Chosen over native libs (`mdns`/`node_mdns`) and `dnssd.js`, confirmed by reading the
*installed* v1.4.2 source:

- **Pure JS** (deps: `multicast-dns`, `fast-deep-equal`) — no native build, no
  electron-rebuild/ABI work, ships identically on all three OSes. (`auto-unpack-natives`
  is therefore not required for discovery; harmless to leave for other deps.)
- **Actively maintained**, large adoption, ships TypeScript types.
- Already provides the three things alternatives don't bundle together: wildcard
  type enumeration, SRV/TXT/A/AAAA resolution, and both goodbye + TTL-expiry departure
  signals.

Native libraries were rejected for their packaging/CI/signing tax (Avahi headers on
Linux, Apple Bonjour SDK on Windows, node-gyp, per-ABI rebuilds) and because the OS
responder can dedupe/cache in ways that hide the raw goodbye/TTL events we need.
`dnssd.js` was rejected as under-maintained — we'd write the same wrapper anyway.

### 3.2 What it gives us out of the box

- **Discover all service types in one browser:** `bonjour.find(null)` enters wildcard
  mode — it queries the meta-query `_services._dns-sd._udp.local` (PTR), collects every
  responding service *type* into an internal `nameMap`, auto-issues a per-type PTR
  browse, and tracks instances across all of them. This is the RFC 6763 §9 two-stage
  fan-out; no manual meta-query needed.
- **Per-instance resolution:** SRV → host/port; TXT → decoded `txt` map **and** raw
  `rawTxt` buffers; A/AAAA → `addresses[]` (IPv4 and IPv6, multiple per host).
- **Departure signals:** goodbye packets (PTR `ttl===0` → `down`) and a public
  `browser.expire()` using per-service `ttl` + `lastSeen`.

### 3.3 What the DiscoveryManager must add (the wrapper)

1. **Expiry timer (critical).** bonjour-service has **no internal timer** calling
   `expire()`. Run a ~1s `setInterval` calling `expire()` on every browser so devices
   that vanish *without* a goodbye (sleep, `kill -9`, cable pull — the common case)
   transition to LEFT. Without this they linger forever.
2. **Dual-stack engines.** A single `Bonjour()` is IPv4-only (`udp4`). Construct a
   second `udp6` engine (`{ type:'udp6', ip:'ff02::fb', interface:<scoped addr> }`).
   Run a wildcard browser on each.
3. **Aggregate + dedupe.** The same instance arrives on udp4 and udp6. Key every
   instance on the **case-insensitive fully-qualified Service Instance Name** (not IP or
   hostname); merge by taking the **union** of addresses across engines.
4. **Address classification.** `addresses[]` is a flat `string[]`. Bucket each into
   `loopback` (127.0.0.0/8, ::1) / `linklocal` (169.254.0.0/16, fe80::/10) / `ipv4` /
   `ipv6`. Store the `%zone` for link-local IPv6 (unusable without it).
5. **State machine** per host/instance: `ACTIVE → STALE → LEFT` with `lastSeen`. Anchor
   "present" on the longer-lived PTR/SRV TTL (4500s default), **not** the 120s A/AAAA
   TTL, so brief address-record churn doesn't flap items offline. Goodbye = immediate
   LEFT (after a 1s grace); expire poll = silent LEFT.
6. **Rescan** = `browser.update()` (resets query backoff) + re-evaluate interfaces.
   Does **not** clear the list (no flicker), matching the prototype's "Rescan complete".
7. **TXT fidelity:** prefer `rawTxt` for boolean/no-value/binary keys (the decoder
   naively splits on the first `=`).

### 3.4 Cross-platform notes

- All sockets run in the **main** process; the sandboxed renderer never opens sockets.
- **Port 5353 coexistence** is handled: `multicast-dns` binds with `reuseAddr`
  (SO_REUSEADDR/REUSEPORT) by default, so we share the port with mDNSResponder/Avahi.
  Never disable it.
- **macOS:** Sequoia (15+) gates local-network multicast behind the Local Network TCC
  permission, including for a packaged double-clicked `.app`. Add
  `NSLocalNetworkUsageDescription` to the packaged Info.plist (via forge
  `packagerConfig`). Do **not** request `com.apple.developer.networking.multicast`
  (iOS-only). Denied permission fails **silently** (`EHOSTUNREACH`; the
  Terminal-launched binary works while the double-clicked `.app` fails) — add a startup
  health check that surfaces a "grant Local Network access in System Settings" hint if
  the first sends yield `EHOSTUNREACH` or no responses within a few seconds. Test the
  real double-clicked `.app`.
- **Windows:** Defender Firewall prompts to allow inbound UDP on first multicast bind —
  grant Private network.
- **Linux:** no per-app prompt; Avahi typically owns 5353 and reuseAddr coexists.
- Listen for the `multicast-dns` **`warning`** event so per-interface `addMembership`
  failures aren't silently swallowed.
- **Known limitation:** the meta-query never signals a *type* withdrawal — only
  per-*instance* departures. Types with zero live instances are hidden in the UI.

## 4. Process architecture

```
┌─ MAIN (Node) ───────────────┐  IPC   ┌─ PRELOAD ────────┐   ┌─ RENDERER (Vite/React) ──┐
│ DiscoveryManager            │ deltas→│ contextBridge     │ → │ zustand store            │
│  • engine pool (udp4/udp6)  │ ◀ cmds │  typed, read-only │   │  applies snapshot+deltas │
│  • aggregate/dedupe by fqdn │        │  api              │   │   ↓ derived selectors    │
│  • expire timer → state     │        │                   │   │ Services·Hosts·IPs·All   │
│  • address classifier       │        │                   │   │ + detail pane (Radix)    │
│  • settings store (JSON)    │        │                   │   │ search · live/pause      │
└─────────────────────────────┘        └───────────────────┘   └──────────────────────────┘
```

Service types and IP groups are **derived in the renderer** from `instances` + `hosts`,
so main stays UI-agnostic. The renderer's selectors mirror the prototype's `buildTree` /
`buildIpGroups` / `buildFlat` / `buildDetail`.

## 5. Data model (shared types)

```ts
type AddrFamily = 'ipv4' | 'ipv6' | 'linklocal' | 'loopback'
interface Address { value: string; family: AddrFamily; zone?: string }   // zone for fe80::%en0

interface Host {
  id: string            // lowercased hostname target, e.g. "andy-mac-studio.local."
  displayName: string   // best human label (instance name or hostname)
  hostname: string      // "Andy-Mac-Studio.local."
  addresses: Address[]
  firstSeen: number; lastSeen: number; present: boolean   // present=false → LEFT
}

interface Instance {
  key: string           // identity = lowercased fqdn "Name._airplay._tcp.local."
  name: string          // instance label
  serviceType: string   // "_airplay._tcp"
  protocol: 'tcp' | 'udp'
  port: number
  txt: Record<string, string>
  rawTxt?: Array<{ key: string; value: string | null }>
  hostId: string
  firstSeen: number; lastSeen: number; present: boolean
}
```

- A bundled **service-type dictionary** (`_airplay._tcp` → friendly name + description,
  seeded from the prototype's `SVC` map and expanded from the well-known DNS-SD list)
  provides labels, falling back to the raw type.
- **Two staleness concepts, kept separate:**
  - *Per-entity liveness* — `present`/`lastSeen` from main → LEFT badge + ~30s
    auto-prune (main emits a remove delta). The engine's internal `STALE` sub-state
    (refresh queries unanswered but not yet expired) is **not** exposed over IPC; the
    renderer sees only `present` + `lastSeen`.
  - *Snapshot freshness* — the toolbar/status-bar fresh→aging→stale tint, derived
    renderer-side from `pausedAt` (aging ≥5s, stale ≥12s, per the prototype).
- **NEW** badge = `firstSeen` within ~6s while live (renderer-derived).

## 6. IPC contract (typed, via contextBridge)

```ts
// main → renderer (events)
'discovery:snapshot'  { hosts: Host[]; instances: Instance[] }      // on subscribe / rescan
'discovery:delta'     { upsertHosts?, removeHostIds?, upsertInstances?, removeInstanceKeys? }
'discovery:status'    { live: boolean; scanning: boolean }

// renderer → main (invoke)
rescan()                          // browser.update() + re-eval interfaces; no list clear
setLive(on: boolean)              // pause/resume discovery (stops/starts engines)
resolve(instanceKey)              // force-refresh one instance's SRV/A, bump lastSeen
openExternal(url)                 // shell.openExternal for web services
exportData({ format: 'json'|'csv', payload })        // main serializes + showSaveDialog + writes file
                                                     // text export is renderer-only (format + clipboard)
getSettings() / setSettings(patch)
```

- **Persistence:** a small JSON file in `app.getPath('userData')` (no new dependency)
  holding appearance, view toggles (`showDesc`/`showV6`/`showLinkLocal`), `sortBy`,
  last lens, window bounds.
- **Export flow:** the renderer builds the filtered, view-shaped record set ("export
  what you see"). For **JSON/CSV** it sends `{ format, payload }` to main, which
  serializes (JSON = structured; CSV = one row per instance: host, ip, type, port, txt…)
  and writes via a save dialog. **Text** export is renderer-only — format a
  human-readable snapshot and copy to the clipboard with a toast.
- **Copy** stays in the renderer via the clipboard API (toast on success).

## 7. UI structure (React + Radix Themes)

### 7.1 Theming via Radix tokens

The prototype's CSS variables (`--gray-a3`, `--accent-9`, `--green-11`, radii, fonts)
**are Radix's color scales**. Wrap the app in
`<Theme appearance={dark|light} accentColor="indigo" grayColor="slate" radius="medium">`,
**delete the prototype's hardcoded `:root` palette**, and inherit those exact tokens.
Bespoke layout/spacing CSS moves to CSS Modules, still referencing the same token names.
Density is fixed to the prototype's "comfortable" set (`--row-h: 30px`).

### 7.2 Component tree

```
<Theme appearance accentColor="indigo">
  <Toolbar/>        // LiveToggle · SegmentedControl(lenses) · Search · Rescan · ViewMenu · ThemeToggle · ExportMenu
  <Body>
    <ListPane/>     // header(title·count·expand/collapse) + ServicesTree | HostsTree | IpGroups | AllFlat
    <DetailPane/>   // Empty | InstanceDetail | HostDetail | ServiceTypeDetail | IpDetail
  </Body>
  <StatusBar/>      // live indicator · counts · updated label
  <Toast/>
</Theme>
```

**Radix Themes components** cover most chrome: `SegmentedControl` (lenses), `TextField`
+ slot icon (search), `DropdownMenu` with `CheckboxItem` (View + Export menus, Show
toggles), `Switch`, `IconButton` (rescan/theme), `Button` (Export/actions), `Badge`
(NEW/LEFT, counts, IP chips), `Tooltip`, `ScrollArea`, `Kbd`. Bespoke parts (list rows,
grouped address blocks, meta/TXT tables) are CSS Modules. Icons reuse the prototype's
inline SVGs as components for pixel fidelity.

### 7.3 The four lenses (derived selectors)

- **Services** — tree by `serviceType`: type + proto badge + description (when *Show
  descriptions*) + count; children = instances (name, hostname subtitle, primary-IP
  chip, `:port`, NEW/LEFT).
- **Hosts** — tree by host: name, hostname subtitle, primary-IP chip, count; children =
  instances (type, `:port`, NEW/LEFT).
- **Discovered IPs** — grouped by family (colored dot + count); rows = address (mono),
  host subtitle, port chips, copy button. Respects *Show IPv6 / Show link-local*.
- **All Instances** — flat, sortable by name / IP / last-seen.

### 7.4 Detail pane (selection-kind driven, per `buildDetail`)

Header (kind icon · name · Live/Offline badge · subtitle · service description) →
action buttons (**Open in Browser** for web types, **Copy Hostname**, **Resolve**,
**Show Host**, **Copy IP**) → **Addresses** (grouped, click-to-copy endpoint) →
**Details** meta table → **Services advertised / on host** (host & IP kinds) →
**Advertised by** hosts (service-type kind) → **TXT records** table (or "No TXT
records"). Empty state = radar icon + "Select an item to see details".

### 7.5 Behaviors

- **Window chrome:** native frame; macOS `titleBarStyle: 'hiddenInset'` so the toolbar
  tucks behind the real traffic lights. Drop the prototype's fake traffic-light dots and
  simulated desktop backdrop.
- **Keyboard:** ⌘K // focus search · Space/`p` live toggle · `r` rescan · `1–4` lenses ·
  Esc clears/blurs search.
- **Live/Pause:** pausing stops the engines; the fresh→aging→stale toolbar tint is
  renderer-derived from `pausedAt`.
- **Virtualization:** skipped for v1; noted as a perf follow-up if lists get huge.

## 8. Testing strategy

Abstract the mDNS layer behind a **`DiscoverySource`** interface (emits up / down /
srv-update / txt-update). The real `BonjourSource` wraps the udp4+udp6 engines; a
**`FakeSource`** feeds synthetic events. The prototype's `SVC`/`HOSTS`/`INST` arrays
become fixtures. TDD the engine logic and selectors.

- **Unit (Vitest, fake timers):** address classifier (incl. `fe80::%zone`), fqdn dedupe
  across engines, state machine (LEFT via goodbye **and** via expire poll), ~30s
  auto-prune, derived selectors, search filter, TXT decode (first-`=` + `rawTxt`
  booleans), export formatters.
- **Component (React Testing Library):** lens switching, selection, search, copy→toast,
  each detail variant.
- **Integration smoke:** `DiscoveryManager` + `FakeSource` → assert snapshot + deltas
  over a mock IPC.
- **Manual matrix:** macOS Local Network grant + silent-`EHOSTUNREACH` health check;
  Windows firewall; Linux/Avahi coexistence; cleanly-stopped responder departs via
  goodbye; `kill -9`'d responder departs via expire poll; IPv6-only responder seen by
  the udp6 engine.

## 9. Project structure

```
src/
  main/      index.ts · discovery/{DiscoveryManager,sources/{BonjourSource,FakeSource},classify,dedupe,state}.ts
             ipc.ts · settings.ts · serviceTypes.ts
  preload/   index.ts            (typed contextBridge api)
  renderer/  main.tsx · store/ (zustand + selectors) · components/ (Toolbar,ListPane,DetailPane,StatusBar,Toast,lenses,detail variants) · lib/ (export,search,icons,keyboard)
  shared/    types.ts            (Host, Instance, Address, IPC contract)
forge.config.ts · vite.{main,preload,renderer}.config.ts
```

**Deps to add:** `react-dom`, `zustand`.
**Dev deps to add:** `typescript`, `vitest`, `@testing-library/react`, `happy-dom`,
`@vitejs/plugin-react`.

## 10. Baked-in defaults

Resolve = targeted re-query that bumps last-seen + toast · auto-prune ~30s · NEW window
~6s · staleness aging 5s / stale 12s · default appearance **dark** · Open-in-Browser web
types = `_http` / `_https` / `_hue` (https) / `_prusalink` / `_home-assistant`.

## 11. Non-goals (v1)

- No code signing / notarization / auto-update.
- **Browse-only** — no advertising/publishing of services.
- No per-NIC dual-stack (default udp4 + udp6 only).
- No sidebar/tabs layout; no density or accent-color controls.
- No persistence beyond UI settings; no snapshot cache.
- No list virtualization.
- No interface-attribution UI.
- Service types with zero live instances are hidden (protocol can't signal type
  withdrawal).

## 12. Key risks

- **Silent departures** if the expire timer is missing or mis-tuned → relies on the ~1s
  `expire()` poll; verified by the `kill -9` manual test.
- **macOS Local Network permission** silent failure → mitigated by Info.plist string +
  startup health check; must be tested via the packaged `.app`, not Terminal.
- **Cross-interface duplicates / IPv6** → mitigated by fqdn-keyed dedupe + address union;
  verified by the IPv6-only responder test.
- **TTL flapping** if presence is anchored on A/AAAA (120s) instead of PTR/SRV (4500s).
- **bonjour-service version drift** — pin `^1.4.2` (the `ttl`/`lastSeen`/`expire` API
  landed in 1.4.0); test upgrades.
