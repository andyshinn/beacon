# Beacon Foundation & Discovery Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and fully unit-test Beacon's main-process mDNS discovery engine — a pure, deterministic core that turns DNS-SD events into a canonical, deduped, live model of hosts/instances/addresses — plus a `bonjour-service` adapter and a real-network smoke harness.

**Architecture:** A `DiscoverySource` interface decouples the protocol library from the model. A `FakeSource` drives deterministic tests; a `BonjourSource` wraps `bonjour-service`'s udp4 + udp6 wildcard browsers for the real network. A `DiscoveryStore` folds source events into canonical `Host`/`Instance` maps (dedupe by case-insensitive service-instance name, union addresses, classify families). A `DiscoveryManager` orchestrates the source + store, owns the ~1s expire poll and ~30s prune, and emits `snapshot`/`delta`/`status` events that a later plan forwards over IPC.

**Tech Stack:** TypeScript (strict) · Node (Electron 42 main process, Node 20+) · `bonjour-service` ^1.4.2 (pure-JS) · Vitest. No DOM, no Electron APIs in this plan (the adapter wires the real `Bonjour` but is verified via an injected factory + manual smoke).

## This is Plan 1 of 4

1. **Foundation & discovery engine** ← this plan
2. Electron shell + IPC + preload + minimal renderer
3. Full renderer UI (lenses, detail, toolbar, search, live/pause, export, theming)
4. Packaging (forge makers + macOS Local Network permission)

Spec: `docs/superpowers/specs/2026-06-27-beacon-mdns-browser-design.md`.

## Global Constraints

- **Discovery library:** `bonjour-service`, pinned `^1.4.2`. Pure-JS — no native build, no `auto-unpack-natives` needed for discovery.
- **Process boundary:** all sockets live in the **main** process. (Plan 1 code is all main/shared.)
- **Identity:** an instance's identity key is its **lowercased, trailing-dot-normalized fully-qualified Service Instance Name** (e.g. `name._airplay._tcp.local.`). Never key on IP or hostname.
- **Presence anchoring:** treat a service as present based on the longer-lived PTR/SRV TTL, not the 120s A/AAAA TTL. Departures come from goodbye (`down`) **or** the ~1s `expire()` poll. Auto-prune a departed entity **~30000 ms** after it departs.
- **Address families:** `loopback` (127.0.0.0/8, ::1) · `linklocal` (169.254.0.0/16, fe80::/10) · `ipv4` · `ipv6`. Preserve the `%zone` for link-local IPv6.
- **Dual-stack:** one udp4 + one udp6 engine on the default interface; dedupe across engines by identity key, union the addresses.
- **Defaults (exact):** expire poll interval `1000 ms` · prune grace `30000 ms` · rescan "scanning" window `1200 ms`.
- **Discipline:** TypeScript `strict: true`. TDD — test first, watch it fail, minimal implementation, watch it pass, commit. Frequent commits.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` (modify) | Add dev deps + scripts |
| `tsconfig.json` (create) | Strict TS config for typecheck/vitest/tsx |
| `vitest.config.ts` (create) | Node-env test runner |
| `src/shared/types.ts` (create) | All shared domain + event types |
| `src/main/discovery/classify.ts` (+ test) | Address-string → `Address` (family + zone) |
| `src/main/discovery/identity.ts` (+ test) | fqdn/host-name parsing & normalization |
| `src/main/discovery/sources/FakeSource.ts` (+ test) | In-memory `DiscoverySource` for tests/dev |
| `src/main/discovery/sources/fixtures.ts` (create) | Realistic `DiscoveredService[]` from the prototype data |
| `src/main/discovery/store.ts` (+ tests) | `DiscoveryStore`: upsert/markDown/prune/snapshot |
| `src/main/discovery/DiscoveryManager.ts` (+ test) | Orchestrator: source + store + timers + events |
| `src/main/discovery/sources/BonjourSource.ts` (+ test) | Real `bonjour-service` udp4+udp6 adapter |
| `scripts/discover.ts` (create) | Manual real-network smoke harness |

---

## Task 1: Project tooling & shared types

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`, `vitest.config.ts`, `src/shared/types.ts`, `tests/setup.smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the full shared type surface used by every later task —
  `AddrFamily`, `Address`, `RawTxtEntry`, `Host`, `Instance`, `DiscoveredService`,
  `SourceEvent`, `DiscoverySource`, `DiscoverySnapshot`, `DiscoveryDelta`,
  `DiscoveryStatus`; plus `pnpm test` / `pnpm typecheck` working.

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm add -D typescript@^5.6.0 vitest@^2.1.0 @types/node@^20.16.0 tsx@^4.19.0
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src", "tests", "scripts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Add scripts to `package.json`**

Add this `"scripts"` block to `package.json` (keep existing `dependencies`/`devDependencies`):

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "smoke:discover": "tsx scripts/discover.ts"
  },
```

- [ ] **Step 5: Create `src/shared/types.ts`**

```ts
// Address classification
export type AddrFamily = 'ipv4' | 'ipv6' | 'linklocal' | 'loopback'

export interface Address {
  value: string // ip without zone, e.g. "fe80::1"
  family: AddrFamily
  zone?: string // interface scope for link-local IPv6, e.g. "en0"
}

export interface RawTxtEntry {
  key: string
  value: string | null // null = boolean/no-value key
}

// Canonical model (owned by main, mirrored in renderer in later plans)
export interface Host {
  id: string // lowercased hostname, e.g. "andy-mac-studio.local."
  displayName: string
  hostname: string // "Andy-Mac-Studio.local."
  addresses: Address[]
  firstSeen: number
  lastSeen: number
  present: boolean
  departedAt?: number
}

export interface Instance {
  key: string // lowercased fqdn "name._airplay._tcp.local."
  name: string
  serviceType: string // "_airplay._tcp"
  protocol: 'tcp' | 'udp'
  port: number
  txt: Record<string, string>
  rawTxt?: RawTxtEntry[]
  hostId: string
  firstSeen: number
  lastSeen: number
  present: boolean
  departedAt?: number
}

// What a DiscoverySource emits per resolved instance
export interface DiscoveredService {
  key: string // identity key (lowercased fqdn)
  name: string
  serviceType: string // "_airplay._tcp"
  protocol: 'tcp' | 'udp'
  port: number
  hostname: string // SRV target, "Andy-Mac-Studio.local."
  addresses: string[] // raw ip strings, may include "%zone"
  txt: Record<string, string>
  rawTxt?: RawTxtEntry[]
  ttl?: number
}

export type SourceEvent =
  | { type: 'up' | 'srv-update' | 'txt-update'; service: DiscoveredService }
  | { type: 'down'; key: string }

export interface DiscoverySource {
  start(): void
  stop(): void
  update(): void // rescan / re-query
  expire(): void // ask the underlying browser to drop TTL-expired services
  subscribe(listener: (event: SourceEvent) => void): () => void
}

// Outputs
export interface DiscoverySnapshot {
  hosts: Host[]
  instances: Instance[]
}

export interface DiscoveryDelta {
  upsertHosts?: Host[]
  removeHostIds?: string[]
  upsertInstances?: Instance[]
  removeInstanceKeys?: string[]
}

export interface DiscoveryStatus {
  live: boolean
  scanning: boolean
}
```

- [ ] **Step 6: Create a smoke test `tests/setup.smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import type { Address } from '../src/shared/types'

describe('tooling', () => {
  it('runs vitest and imports shared types', () => {
    const a: Address = { value: '127.0.0.1', family: 'loopback' }
    expect(a.family).toBe('loopback')
  })
})
```

- [ ] **Step 7: Verify it passes and typechecks**

Run: `pnpm test`
Expected: 1 passing test.
Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts src/shared/types.ts tests/setup.smoke.test.ts
git commit -m "chore: add TS + Vitest tooling and shared discovery types"
```

---

## Task 2: Address classifier

**Files:**
- Create: `src/main/discovery/classify.ts`, `src/main/discovery/classify.test.ts`

**Interfaces:**
- Consumes: `Address`, `AddrFamily` from `src/shared/types`.
- Produces: `classifyAddress(ip: string): Address` — splits an optional `%zone`, classifies family.

- [ ] **Step 1: Write the failing test (`classify.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { classifyAddress } from './classify'

describe('classifyAddress', () => {
  it('classifies private and public IPv4 as ipv4', () => {
    expect(classifyAddress('172.16.20.157')).toEqual({ value: '172.16.20.157', family: 'ipv4' })
  })
  it('classifies IPv4 loopback', () => {
    expect(classifyAddress('127.0.0.1')).toEqual({ value: '127.0.0.1', family: 'loopback' })
  })
  it('classifies IPv4 link-local (169.254/16)', () => {
    expect(classifyAddress('169.254.5.9')).toEqual({ value: '169.254.5.9', family: 'linklocal' })
  })
  it('classifies global/ULA IPv6 as ipv6', () => {
    expect(classifyAddress('fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6')).toEqual({
      value: 'fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6',
      family: 'ipv6',
    })
  })
  it('classifies IPv6 loopback ::1', () => {
    expect(classifyAddress('::1')).toEqual({ value: '::1', family: 'loopback' })
  })
  it('classifies IPv6 link-local fe80::/10 and keeps the zone', () => {
    expect(classifyAddress('fe80::cb3:f675:6b85:c344%en0')).toEqual({
      value: 'fe80::cb3:f675:6b85:c344',
      family: 'linklocal',
      zone: 'en0',
    })
  })
  it('treats fe80 without a zone as link-local with no zone', () => {
    expect(classifyAddress('fe80::1')).toEqual({ value: 'fe80::1', family: 'linklocal' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/classify.test.ts`
Expected: FAIL — "Failed to resolve import './classify'".

- [ ] **Step 3: Write minimal implementation (`classify.ts`)**

```ts
import type { Address, AddrFamily } from '../../shared/types'

export function classifyAddress(ip: string): Address {
  const pct = ip.indexOf('%')
  const zone = pct >= 0 ? ip.slice(pct + 1) : undefined
  const value = pct >= 0 ? ip.slice(0, pct) : ip
  const family = familyOf(value)
  return zone ? { value, family, zone } : { value, family }
}

function familyOf(value: string): AddrFamily {
  if (value.includes(':')) {
    const lower = value.toLowerCase()
    if (lower === '::1') return 'loopback'
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb'))
      return 'linklocal' // fe80::/10
    return 'ipv6'
  }
  if (value.startsWith('127.')) return 'loopback'
  if (value.startsWith('169.254.')) return 'linklocal'
  return 'ipv4'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/classify.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/discovery/classify.ts src/main/discovery/classify.test.ts
git commit -m "feat: classify discovered addresses into family + zone"
```

---

## Task 3: Identity & name normalization

**Files:**
- Create: `src/main/discovery/identity.ts`, `src/main/discovery/identity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `instanceKey(fqdn: string): string` — lowercased, exactly one trailing dot.
  - `hostId(hostname: string): string` — lowercased, exactly one trailing dot.
  - `cleanHostname(hostname: string): string` — trailing dot stripped (for display).
  - `parseInstanceName(fqdn: string): { instance: string; serviceType: string; protocol: 'tcp' | 'udp'; domain: string } | null`

- [ ] **Step 1: Write the failing test (`identity.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { instanceKey, hostId, cleanHostname, parseInstanceName } from './identity'

describe('identity helpers', () => {
  it('instanceKey lowercases and normalizes the trailing dot', () => {
    expect(instanceKey("Andy's Mac Studio._airplay._tcp.local")).toBe("andy's mac studio._airplay._tcp.local.")
    expect(instanceKey("Andy's Mac Studio._airplay._tcp.local.")).toBe("andy's mac studio._airplay._tcp.local.")
  })
  it('hostId lowercases and normalizes the trailing dot', () => {
    expect(hostId('Andy-Mac-Studio.local')).toBe('andy-mac-studio.local.')
    expect(hostId('Andy-Mac-Studio.local.')).toBe('andy-mac-studio.local.')
  })
  it('cleanHostname strips the trailing dot', () => {
    expect(cleanHostname('Andy-Mac-Studio.local.')).toBe('Andy-Mac-Studio.local')
  })
  it('parseInstanceName splits a full service instance name', () => {
    expect(parseInstanceName("Andy's Mac Studio._airplay._tcp.local.")).toEqual({
      instance: "Andy's Mac Studio",
      serviceType: '_airplay._tcp',
      protocol: 'tcp',
      domain: 'local.',
    })
  })
  it('parseInstanceName handles udp services', () => {
    expect(parseInstanceName('Living Room._meshcop._udp.local.')).toEqual({
      instance: 'Living Room',
      serviceType: '_meshcop._udp',
      protocol: 'udp',
      domain: 'local.',
    })
  })
  it('parseInstanceName returns null for a non-service name', () => {
    expect(parseInstanceName('just-a-hostname.local.')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/identity.test.ts`
Expected: FAIL — "Failed to resolve import './identity'".

- [ ] **Step 3: Write minimal implementation (`identity.ts`)**

```ts
function normalizeDot(name: string): string {
  return name.endsWith('.') ? name : name + '.'
}

export function instanceKey(fqdn: string): string {
  return normalizeDot(fqdn).toLowerCase()
}

export function hostId(hostname: string): string {
  return normalizeDot(hostname).toLowerCase()
}

export function cleanHostname(hostname: string): string {
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname
}

const INSTANCE_RE = /^(.+)\.(_[^.]+)\.(_(tcp|udp))\.(.+\.?)$/

export function parseInstanceName(
  fqdn: string,
): { instance: string; serviceType: string; protocol: 'tcp' | 'udp'; domain: string } | null {
  const m = INSTANCE_RE.exec(normalizeDot(fqdn))
  if (!m) return null
  const [, instance, app, proto, protocol, domain] = m
  return {
    instance: instance!,
    serviceType: `${app}.${proto}`,
    protocol: protocol as 'tcp' | 'udp',
    domain: domain!,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/identity.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/discovery/identity.ts src/main/discovery/identity.test.ts
git commit -m "feat: add service-instance-name and host-name normalization"
```

---

## Task 4: FakeSource & fixtures

**Files:**
- Create: `src/main/discovery/sources/FakeSource.ts`, `src/main/discovery/sources/FakeSource.test.ts`, `src/main/discovery/sources/fixtures.ts`

**Interfaces:**
- Consumes: `DiscoverySource`, `SourceEvent`, `DiscoveredService` from `src/shared/types`; `instanceKey` from `../identity`.
- Produces:
  - `class FakeSource implements DiscoverySource` with extra test hooks:
    `emit(event: SourceEvent): void`, and counters `started: boolean`, `updateCalls: number`, `expireCalls: number`.
  - `makeService(partial: Partial<DiscoveredService> & { name: string; serviceType: string; hostname: string }): DiscoveredService` — fixture builder filling sane defaults + deriving `key`.
  - `FIXTURE_SERVICES: DiscoveredService[]` — a realistic dataset.

- [ ] **Step 1: Write the failing test (`FakeSource.test.ts`)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { FakeSource, makeService } from './FakeSource'

describe('FakeSource', () => {
  it('delivers emitted events to subscribers and supports unsubscribe', () => {
    const src = new FakeSource()
    const seen = vi.fn()
    const unsub = src.subscribe(seen)
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.' })
    src.emit({ type: 'up', service: svc })
    expect(seen).toHaveBeenCalledWith({ type: 'up', service: svc })
    unsub()
    src.emit({ type: 'down', key: svc.key })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('tracks lifecycle and command calls', () => {
    const src = new FakeSource()
    expect(src.started).toBe(false)
    src.start()
    expect(src.started).toBe(true)
    src.update()
    src.update()
    src.expire()
    src.stop()
    expect(src.updateCalls).toBe(2)
    expect(src.expireCalls).toBe(1)
    expect(src.started).toBe(false)
  })

  it('makeService derives a normalized identity key', () => {
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.' })
    expect(svc.key).toBe('porch._http._tcp.local.')
    expect(svc.protocol).toBe('tcp')
    expect(svc.port).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/sources/FakeSource.test.ts`
Expected: FAIL — "Failed to resolve import './FakeSource'".

- [ ] **Step 3: Write minimal implementation (`FakeSource.ts`)**

```ts
import type { DiscoveredService, DiscoverySource, SourceEvent } from '../../../shared/types'
import { instanceKey } from '../identity'

export class FakeSource implements DiscoverySource {
  started = false
  updateCalls = 0
  expireCalls = 0
  private listeners = new Set<(event: SourceEvent) => void>()

  start(): void {
    this.started = true
  }
  stop(): void {
    this.started = false
  }
  update(): void {
    this.updateCalls++
  }
  expire(): void {
    this.expireCalls++
  }
  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // test/dev hook
  emit(event: SourceEvent): void {
    for (const l of [...this.listeners]) l(event)
  }
}

export function makeService(
  partial: Partial<DiscoveredService> & { name: string; serviceType: string; hostname: string },
): DiscoveredService {
  const protocol = partial.serviceType.endsWith('._udp') ? 'udp' : 'tcp'
  const fqdn = `${partial.name}.${partial.serviceType}.local.`
  return {
    key: instanceKey(fqdn),
    name: partial.name,
    serviceType: partial.serviceType,
    protocol,
    port: partial.port ?? 80,
    hostname: partial.hostname,
    addresses: partial.addresses ?? [],
    txt: partial.txt ?? {},
    rawTxt: partial.rawTxt,
    ttl: partial.ttl ?? 4500,
  }
}
```

- [ ] **Step 4: Create `fixtures.ts` (realistic dataset for dev/manager tests)**

```ts
import type { DiscoveredService } from '../../../shared/types'
import { makeService } from './FakeSource'

// A trimmed, realistic set derived from the Beacon prototype data.
export const FIXTURE_SERVICES: DiscoveredService[] = [
  makeService({
    name: "Andy's Mac Studio",
    serviceType: '_airplay._tcp',
    hostname: 'Andy-Mac-Studio.local.',
    port: 7000,
    addresses: ['172.16.20.157', 'fdc9:5672:bcfa:4ac9:8f8:bcb5:5635:bfe6', 'fe80::cb3:f675:6b85:c344%en0'],
    txt: { deviceid: 'DA:F2:04:CD:40:AB', model: 'Mac14,14' },
  }),
  makeService({
    name: "Andy's Mac Studio",
    serviceType: '_ssh._tcp',
    hostname: 'Andy-Mac-Studio.local.',
    port: 22,
    addresses: ['172.16.20.157'],
  }),
  makeService({
    name: 'Living Room',
    serviceType: '_meshcop._udp',
    hostname: 'Living-Room.local.',
    port: 49191,
    addresses: ['172.16.20.51', 'fe80::18e4:21ff:fe55:1a2b%en0'],
    txt: { nn: 'MyHome', rv: '1' },
  }),
  makeService({
    name: 'Kitchen Switch',
    serviceType: '_http._tcp',
    hostname: 'Kitchen-Switch.local.',
    port: 80,
    addresses: ['172.16.20.60'],
    txt: { gen: '2', app: 'Plus1', ver: '1.7.5' },
  }),
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/main/discovery/sources/FakeSource.test.ts`
Expected: PASS (3 tests).
Run: `pnpm typecheck`
Expected: no errors (confirms `fixtures.ts` compiles).

- [ ] **Step 6: Commit**

```bash
git add src/main/discovery/sources/FakeSource.ts src/main/discovery/sources/FakeSource.test.ts src/main/discovery/sources/fixtures.ts
git commit -m "feat: add FakeSource and realistic discovery fixtures"
```

---

## Task 5: DiscoveryStore — upsert & snapshot

**Files:**
- Create: `src/main/discovery/store.ts`, `src/main/discovery/store.upsert.test.ts`

**Interfaces:**
- Consumes: `DiscoveredService`, `DiscoveryDelta`, `DiscoverySnapshot`, `Host`, `Instance`, `Address` from `src/shared/types`; `classifyAddress` from `./classify`; `hostId`, `cleanHostname` from `./identity`.
- Produces:
  - `class DiscoveryStore` with:
    - `upsert(service: DiscoveredService, now: number): DiscoveryDelta`
    - `snapshot(): DiscoverySnapshot`
  - Behavior: first sighting sets `firstSeen = lastSeen = now`, `present = true`; re-sighting bumps `lastSeen`, clears `departedAt`, refreshes port/txt/addresses. The host is created/updated, its `addresses` is the **union** (deduped by `family:value:zone`) of all its instances' classified addresses, `displayName = cleanHostname(hostname)`.

- [ ] **Step 1: Write the failing test (`store.upsert.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { DiscoveryStore } from './store'
import { makeService } from './sources/FakeSource'

describe('DiscoveryStore.upsert', () => {
  it('creates an instance and its host with classified, deduped addresses', () => {
    const store = new DiscoveryStore()
    const svc = makeService({
      name: "Andy's Mac Studio",
      serviceType: '_airplay._tcp',
      hostname: 'Andy-Mac-Studio.local.',
      port: 7000,
      addresses: ['172.16.20.157', 'fe80::1%en0', '172.16.20.157'],
    })
    const delta = store.upsert(svc, 1000)

    expect(delta.upsertInstances).toHaveLength(1)
    const inst = delta.upsertInstances![0]!
    expect(inst.key).toBe('andy\'s mac studio._airplay._tcp.local.')
    expect(inst.hostId).toBe('andy-mac-studio.local.')
    expect(inst.present).toBe(true)
    expect(inst.firstSeen).toBe(1000)
    expect(inst.lastSeen).toBe(1000)

    const host = delta.upsertHosts![0]!
    expect(host.id).toBe('andy-mac-studio.local.')
    expect(host.displayName).toBe('Andy-Mac-Studio.local')
    expect(host.addresses).toEqual([
      { value: '172.16.20.157', family: 'ipv4' },
      { value: 'fe80::1', family: 'linklocal', zone: 'en0' },
    ])
  })

  it('re-sighting bumps lastSeen but keeps firstSeen, and clears departedAt', () => {
    const store = new DiscoveryStore()
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.', addresses: ['172.16.20.170'] })
    store.upsert(svc, 1000)
    const delta = store.upsert(svc, 5000)
    const inst = delta.upsertInstances![0]!
    expect(inst.firstSeen).toBe(1000)
    expect(inst.lastSeen).toBe(5000)
    expect(inst.departedAt).toBeUndefined()
  })

  it('merges addresses from two instances on the same host (union)', () => {
    const store = new DiscoveryStore()
    store.upsert(makeService({ name: 'Mac', serviceType: '_airplay._tcp', hostname: 'mac.local.', addresses: ['10.0.0.2'] }), 1000)
    const delta = store.upsert(
      makeService({ name: 'Mac', serviceType: '_ssh._tcp', hostname: 'mac.local.', addresses: ['10.0.0.2', '10.0.0.3'] }),
      1000,
    )
    const host = delta.upsertHosts![0]!
    expect(host.addresses.map((a) => a.value).sort()).toEqual(['10.0.0.2', '10.0.0.3'])
  })

  it('snapshot returns all hosts and instances', () => {
    const store = new DiscoveryStore()
    store.upsert(makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.', addresses: ['172.16.20.170'] }), 1000)
    const snap = store.snapshot()
    expect(snap.hosts).toHaveLength(1)
    expect(snap.instances).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/store.upsert.test.ts`
Expected: FAIL — "Failed to resolve import './store'".

- [ ] **Step 3: Write minimal implementation (`store.ts`)**

```ts
import type {
  Address,
  DiscoveredService,
  DiscoveryDelta,
  DiscoverySnapshot,
  Host,
  Instance,
} from '../../shared/types'
import { classifyAddress } from './classify'
import { cleanHostname, hostId } from './identity'

export class DiscoveryStore {
  private hosts = new Map<string, Host>()
  private instances = new Map<string, Instance>()

  upsert(service: DiscoveredService, now: number): DiscoveryDelta {
    const hid = hostId(service.hostname)
    const addrs = service.addresses.map(classifyAddress)

    const prev = this.instances.get(service.key)
    const instance: Instance = {
      key: service.key,
      name: service.name,
      serviceType: service.serviceType,
      protocol: service.protocol,
      port: service.port,
      txt: service.txt,
      rawTxt: service.rawTxt,
      hostId: hid,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      present: true,
      departedAt: undefined,
    }
    this.instances.set(instance.key, instance)

    const host = this.upsertHost(hid, service.hostname, addrs, now)
    return { upsertInstances: [instance], upsertHosts: [host] }
  }

  snapshot(): DiscoverySnapshot {
    return { hosts: [...this.hosts.values()], instances: [...this.instances.values()] }
  }

  private upsertHost(hid: string, hostname: string, newAddrs: Address[], now: number): Host {
    const prev = this.hosts.get(hid)
    const merged = unionAddresses(prev?.addresses ?? [], newAddrs)
    const host: Host = {
      id: hid,
      displayName: cleanHostname(hostname),
      hostname,
      addresses: merged,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      present: true,
      departedAt: undefined,
    }
    this.hosts.set(hid, host)
    return host
  }
}

function addrId(a: Address): string {
  return `${a.family}:${a.value}:${a.zone ?? ''}`
}

function unionAddresses(a: Address[], b: Address[]): Address[] {
  const out: Address[] = []
  const seen = new Set<string>()
  for (const addr of [...a, ...b]) {
    const id = addrId(addr)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(addr)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/store.upsert.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/discovery/store.ts src/main/discovery/store.upsert.test.ts
git commit -m "feat: DiscoveryStore upsert builds canonical hosts/instances"
```

---

## Task 6: DiscoveryStore — departures (markDown) & prune

**Files:**
- Modify: `src/main/discovery/store.ts`
- Create: `src/main/discovery/store.lifecycle.test.ts`

**Interfaces:**
- Consumes: same as Task 5.
- Produces, added to `DiscoveryStore`:
  - `markDown(key: string, now: number): DiscoveryDelta` — sets the instance `present=false`, `departedAt=now`; recomputes its host's `present` (true iff any same-host instance is present); a host that flips to absent gets `departedAt=now`. Returns the changed instance (and host if its presence changed). Unknown key → `{}`.
  - `prune(now: number, graceMs: number): DiscoveryDelta` — removes instances with `present=false && departedAt+graceMs <= now`; removes a host when it has no remaining instances **and** (`present=false && departedAt+graceMs <= now`). Returns `removeInstanceKeys` / `removeHostIds` (omitted when empty).

- [ ] **Step 1: Write the failing test (`store.lifecycle.test.ts`)**

```ts
import { describe, it, expect } from 'vitest'
import { DiscoveryStore } from './store'
import { makeService } from './sources/FakeSource'

function seed(store: DiscoveryStore, now = 1000) {
  store.upsert(makeService({ name: 'Mac', serviceType: '_airplay._tcp', hostname: 'mac.local.', addresses: ['10.0.0.2'] }), now)
  store.upsert(makeService({ name: 'Mac', serviceType: '_ssh._tcp', hostname: 'mac.local.', addresses: ['10.0.0.2'] }), now)
}

describe('DiscoveryStore.markDown', () => {
  it('marks an instance absent but keeps the host present while a sibling remains', () => {
    const store = new DiscoveryStore()
    seed(store)
    const delta = store.markDown('mac._airplay._tcp.local.', 2000)
    const inst = delta.upsertInstances![0]!
    expect(inst.present).toBe(false)
    expect(inst.departedAt).toBe(2000)
    expect(delta.upsertHosts![0]!.present).toBe(true) // _ssh sibling still up
  })

  it('flips the host absent when its last instance departs', () => {
    const store = new DiscoveryStore()
    seed(store)
    store.markDown('mac._airplay._tcp.local.', 2000)
    const delta = store.markDown('mac._ssh._tcp.local.', 2500)
    const host = delta.upsertHosts![0]!
    expect(host.present).toBe(false)
    expect(host.departedAt).toBe(2500)
  })

  it('returns an empty delta for an unknown key', () => {
    const store = new DiscoveryStore()
    expect(store.markDown('nope._http._tcp.local.', 2000)).toEqual({})
  })
})

describe('DiscoveryStore.prune', () => {
  it('does not remove a departed instance before the grace window', () => {
    const store = new DiscoveryStore()
    seed(store)
    store.markDown('mac._airplay._tcp.local.', 2000)
    const delta = store.prune(2000 + 29_999, 30_000)
    expect(delta).toEqual({})
  })

  it('removes a departed instance after the grace window', () => {
    const store = new DiscoveryStore()
    seed(store)
    store.markDown('mac._airplay._tcp.local.', 2000)
    const delta = store.prune(2000 + 30_000, 30_000)
    expect(delta.removeInstanceKeys).toEqual(['mac._airplay._tcp.local.'])
    expect(delta.removeHostIds).toBeUndefined() // host still has _ssh
  })

  it('removes the host once its last instance is pruned', () => {
    const store = new DiscoveryStore()
    seed(store)
    store.markDown('mac._airplay._tcp.local.', 2000)
    store.markDown('mac._ssh._tcp.local.', 2000)
    const delta = store.prune(2000 + 30_000, 30_000)
    expect(delta.removeInstanceKeys!.sort()).toEqual(['mac._airplay._tcp.local.', 'mac._ssh._tcp.local.'])
    expect(delta.removeHostIds).toEqual(['mac.local.'])
    expect(store.snapshot()).toEqual({ hosts: [], instances: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/store.lifecycle.test.ts`
Expected: FAIL — "store.markDown is not a function".

- [ ] **Step 3: Add `markDown` and `prune` to `store.ts`**

Add these two methods inside the `DiscoveryStore` class (after `snapshot`):

```ts
  markDown(key: string, now: number): DiscoveryDelta {
    const inst = this.instances.get(key)
    if (!inst) return {}
    const downed: Instance = { ...inst, present: false, departedAt: now }
    this.instances.set(key, downed)

    const host = this.hosts.get(inst.hostId)
    const delta: DiscoveryDelta = { upsertInstances: [downed] }
    if (host) {
      const anyPresent = this.hostHasPresentInstance(host.id)
      if (host.present !== anyPresent) {
        const updated: Host = anyPresent
          ? { ...host, present: true, departedAt: undefined }
          : { ...host, present: false, departedAt: now }
        this.hosts.set(host.id, updated)
        delta.upsertHosts = [updated]
      } else {
        delta.upsertHosts = [host]
      }
    }
    return delta
  }

  prune(now: number, graceMs: number): DiscoveryDelta {
    const removeInstanceKeys: string[] = []
    for (const inst of this.instances.values()) {
      if (!inst.present && inst.departedAt !== undefined && inst.departedAt + graceMs <= now) {
        removeInstanceKeys.push(inst.key)
      }
    }
    for (const key of removeInstanceKeys) this.instances.delete(key)

    const removeHostIds: string[] = []
    for (const host of this.hosts.values()) {
      const hasInstances = this.hostHasAnyInstance(host.id)
      const expired = !host.present && host.departedAt !== undefined && host.departedAt + graceMs <= now
      if (!hasInstances && expired) removeHostIds.push(host.id)
    }
    for (const id of removeHostIds) this.hosts.delete(id)

    const delta: DiscoveryDelta = {}
    if (removeInstanceKeys.length) delta.removeInstanceKeys = removeInstanceKeys
    if (removeHostIds.length) delta.removeHostIds = removeHostIds
    return delta
  }

  private hostHasPresentInstance(id: string): boolean {
    for (const inst of this.instances.values()) if (inst.hostId === id && inst.present) return true
    return false
  }

  private hostHasAnyInstance(id: string): boolean {
    for (const inst of this.instances.values()) if (inst.hostId === id) return true
    return false
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/store.lifecycle.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/discovery/store.ts src/main/discovery/store.lifecycle.test.ts
git commit -m "feat: DiscoveryStore departure + grace-window prune"
```

---

## Task 7: DiscoveryManager (orchestrator)

**Files:**
- Create: `src/main/discovery/DiscoveryManager.ts`, `src/main/discovery/DiscoveryManager.test.ts`

**Interfaces:**
- Consumes: `DiscoverySource`, `SourceEvent`, `DiscoverySnapshot`, `DiscoveryDelta`, `DiscoveryStatus` from `src/shared/types`; `DiscoveryStore` from `./store`.
- Produces:
  - `type ManagerEvent = { type: 'snapshot'; snapshot: DiscoverySnapshot } | { type: 'delta'; delta: DiscoveryDelta } | { type: 'status'; status: DiscoveryStatus }`
  - `interface DiscoveryManagerOptions { source: DiscoverySource; onEvent: (event: ManagerEvent) => void; expireIntervalMs?: number; pruneGraceMs?: number; scanWindowMs?: number; now?: () => number }`
  - `class DiscoveryManager` with `start()`, `stop()`, `setLive(on: boolean)`, `rescan()`, `resolve(key: string)`, `getSnapshot()`.
  - Behavior: on `start()` it subscribes to the source, calls `source.start()`, emits an initial `snapshot` + `status{live:true,scanning:false}`, and starts a `setInterval(expireIntervalMs)` that each tick calls `source.expire()` then emits a `delta` from `store.prune(now, pruneGraceMs)` (only when non-empty). Source `up/srv-update/txt-update` → `store.upsert` → emit `delta`; `down` → `store.markDown` → emit `delta`. `rescan()` calls `source.update()` and emits `status{scanning:true}` then `status{scanning:false}` after `scanWindowMs`. `setLive(false)` stops the source + interval and emits status; `setLive(true)` restarts them. The store is **not** cleared on pause or rescan.

- [ ] **Step 1: Write the failing test (`DiscoveryManager.test.ts`)**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiscoveryManager, type ManagerEvent } from './DiscoveryManager'
import { FakeSource, makeService } from './sources/FakeSource'

function collector() {
  const events: ManagerEvent[] = []
  return { events, onEvent: (e: ManagerEvent) => events.push(e) }
}

describe('DiscoveryManager', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('emits an initial snapshot and live status on start', () => {
    const source = new FakeSource()
    const { events, onEvent } = collector()
    new DiscoveryManager({ source, onEvent }).start()
    expect(source.started).toBe(true)
    expect(events).toContainEqual({ type: 'snapshot', snapshot: { hosts: [], instances: [] } })
    expect(events).toContainEqual({ type: 'status', status: { live: true, scanning: false } })
  })

  it('forwards an up event as an upsert delta', () => {
    const source = new FakeSource()
    const { events, onEvent } = collector()
    new DiscoveryManager({ source, onEvent }).start()
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.', addresses: ['172.16.20.170'] })
    source.emit({ type: 'up', service: svc })
    const delta = events.find((e) => e.type === 'delta') as Extract<ManagerEvent, { type: 'delta' }>
    expect(delta.delta.upsertInstances![0]!.key).toBe('porch._http._tcp.local.')
  })

  it('polls source.expire on the interval and prunes after the grace window', () => {
    const source = new FakeSource()
    const { events, onEvent } = collector()
    const mgr = new DiscoveryManager({ source, onEvent, expireIntervalMs: 1000, pruneGraceMs: 30_000 })
    mgr.start()
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.', addresses: ['172.16.20.170'] })
    source.emit({ type: 'up', service: svc })
    source.emit({ type: 'down', key: svc.key })

    vi.advanceTimersByTime(1000)
    expect(source.expireCalls).toBeGreaterThanOrEqual(1)
    // not yet pruned
    expect(events.some((e) => e.type === 'delta' && e.delta.removeInstanceKeys)).toBe(false)

    vi.advanceTimersByTime(30_000)
    const removed = events.some((e) => e.type === 'delta' && e.delta.removeInstanceKeys?.includes(svc.key))
    expect(removed).toBe(true)
  })

  it('rescan toggles scanning status and re-queries the source', () => {
    const source = new FakeSource()
    const { events, onEvent } = collector()
    const mgr = new DiscoveryManager({ source, onEvent, scanWindowMs: 1200 })
    mgr.start()
    mgr.rescan()
    expect(source.updateCalls).toBe(1)
    expect(events).toContainEqual({ type: 'status', status: { live: true, scanning: true } })
    vi.advanceTimersByTime(1200)
    expect(events).toContainEqual({ type: 'status', status: { live: true, scanning: false } })
  })

  it('setLive(false) stops the source and interval without clearing the model', () => {
    const source = new FakeSource()
    const { events, onEvent } = collector()
    const mgr = new DiscoveryManager({ source, onEvent, expireIntervalMs: 1000 })
    mgr.start()
    source.emit({ type: 'up', service: makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.', addresses: ['172.16.20.170'] }) })
    mgr.setLive(false)
    expect(source.started).toBe(false)
    expect(events).toContainEqual({ type: 'status', status: { live: false, scanning: false } })
    const before = source.expireCalls
    vi.advanceTimersByTime(5000)
    expect(source.expireCalls).toBe(before) // interval stopped
    expect(mgr.getSnapshot().instances).toHaveLength(1) // model preserved
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/DiscoveryManager.test.ts`
Expected: FAIL — "Failed to resolve import './DiscoveryManager'".

- [ ] **Step 3: Write minimal implementation (`DiscoveryManager.ts`)**

```ts
import type {
  DiscoveryDelta,
  DiscoverySnapshot,
  DiscoverySource,
  DiscoveryStatus,
  SourceEvent,
} from '../../shared/types'
import { DiscoveryStore } from './store'

export type ManagerEvent =
  | { type: 'snapshot'; snapshot: DiscoverySnapshot }
  | { type: 'delta'; delta: DiscoveryDelta }
  | { type: 'status'; status: DiscoveryStatus }

export interface DiscoveryManagerOptions {
  source: DiscoverySource
  onEvent: (event: ManagerEvent) => void
  expireIntervalMs?: number
  pruneGraceMs?: number
  scanWindowMs?: number
  now?: () => number
}

export class DiscoveryManager {
  private readonly source: DiscoverySource
  private readonly onEvent: (event: ManagerEvent) => void
  private readonly expireIntervalMs: number
  private readonly pruneGraceMs: number
  private readonly scanWindowMs: number
  private readonly now: () => number

  private store = new DiscoveryStore()
  private unsubscribe?: () => void
  private timer?: ReturnType<typeof setInterval>
  private scanTimer?: ReturnType<typeof setTimeout>
  private live = false

  constructor(options: DiscoveryManagerOptions) {
    this.source = options.source
    this.onEvent = options.onEvent
    this.expireIntervalMs = options.expireIntervalMs ?? 1000
    this.pruneGraceMs = options.pruneGraceMs ?? 30_000
    this.scanWindowMs = options.scanWindowMs ?? 1200
    this.now = options.now ?? Date.now
  }

  start(): void {
    this.unsubscribe = this.source.subscribe((e) => this.handleSourceEvent(e))
    this.source.start()
    this.live = true
    this.startTimer()
    this.onEvent({ type: 'snapshot', snapshot: this.store.snapshot() })
    this.emitStatus(false)
  }

  stop(): void {
    this.stopTimer()
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.source.stop()
    this.live = false
  }

  setLive(on: boolean): void {
    if (on === this.live) return
    if (on) {
      this.source.start()
      this.startTimer()
      this.live = true
    } else {
      this.stopTimer()
      this.source.stop()
      this.live = false
    }
    this.emitStatus(false)
  }

  rescan(): void {
    this.source.update()
    this.emitStatus(true)
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = setTimeout(() => this.emitStatus(false), this.scanWindowMs)
  }

  resolve(_key: string): void {
    // v1: a targeted resolve is a network re-query; the engine re-queries all.
    this.source.update()
  }

  getSnapshot(): DiscoverySnapshot {
    return this.store.snapshot()
  }

  private handleSourceEvent(e: SourceEvent): void {
    const delta = e.type === 'down' ? this.store.markDown(e.key, this.now()) : this.store.upsert(e.service, this.now())
    if (hasDelta(delta)) this.onEvent({ type: 'delta', delta })
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), this.expireIntervalMs)
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private tick(): void {
    this.source.expire()
    const delta = this.store.prune(this.now(), this.pruneGraceMs)
    if (hasDelta(delta)) this.onEvent({ type: 'delta', delta })
  }

  private emitStatus(scanning: boolean): void {
    this.onEvent({ type: 'status', status: { live: this.live, scanning } })
  }
}

function hasDelta(d: DiscoveryDelta): boolean {
  return Boolean(
    d.upsertInstances?.length || d.upsertHosts?.length || d.removeInstanceKeys?.length || d.removeHostIds?.length,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/DiscoveryManager.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/discovery/DiscoveryManager.ts src/main/discovery/DiscoveryManager.test.ts
git commit -m "feat: DiscoveryManager orchestrates source, store, expire poll and prune"
```

---

## Task 8: BonjourSource adapter + smoke harness

**Files:**
- Create: `src/main/discovery/sources/BonjourSource.ts`, `src/main/discovery/sources/BonjourSource.test.ts`, `scripts/discover.ts`

**Interfaces:**
- Consumes: `DiscoverySource`, `SourceEvent`, `DiscoveredService`, `RawTxtEntry` from `src/shared/types`; `instanceKey` from `../identity`; `Bonjour` from `bonjour-service` (real engine only).
- Produces:
  - `decodeTxt(txt: Record<string, unknown>): { txt: Record<string, string>; rawTxt: RawTxtEntry[] }` — `true`/`null`/`undefined` → `{key, value:null}`; `Buffer` → utf8; everything else → `String(v)`.
  - `toDiscoveredService(s: BonjourLikeService): DiscoveredService` — maps a bonjour service object to our shape (`serviceType = `_${type}._${protocol}``, `key = instanceKey(fqdn)`).
  - `interface BonjourLikeService { name: string; type: string; protocol: 'tcp' | 'udp'; port: number; host: string; fqdn: string; addresses?: string[]; txt?: Record<string, unknown>; ttl?: number }`
  - `interface BrowserLike { on(event: string, cb: (s: BonjourLikeService) => void): void; update(): void; expire(): void; stop(): void }`
  - `interface BonjourLike { find(opts: null): BrowserLike; destroy(): void }`
  - `type BonjourFactory = (kind: 'udp4' | 'udp6') => BonjourLike | null`
  - `class BonjourSource implements DiscoverySource` taking `{ createBonjour?: BonjourFactory }`; runs a wildcard browser per engine, maps `up`/`srv-update`/`txt-update`/`down` to `SourceEvent`, and fans `update()`/`expire()`/`stop()` to all engines.

- [ ] **Step 1: Write the failing test (`BonjourSource.test.ts`)**

```ts
import { describe, it, expect, vi } from 'vitest'
import { BonjourSource, decodeTxt, toDiscoveredService, type BonjourLike, type BrowserLike, type BonjourLikeService } from './BonjourSource'

const sampleService: BonjourLikeService = {
  name: "Andy's Mac Studio",
  type: 'airplay',
  protocol: 'tcp',
  port: 7000,
  host: 'Andy-Mac-Studio.local.',
  fqdn: "Andy's Mac Studio._airplay._tcp.local.",
  addresses: ['172.16.20.157', 'fe80::1%en0'],
  txt: { model: 'Mac14,14', flag: true, empty: null },
  ttl: 4500,
}

describe('decodeTxt', () => {
  it('keeps string values and records booleans/nulls as null', () => {
    const { txt, rawTxt } = decodeTxt({ model: 'Mac14,14', flag: true, empty: null })
    expect(txt).toEqual({ model: 'Mac14,14' })
    expect(rawTxt).toEqual([
      { key: 'model', value: 'Mac14,14' },
      { key: 'flag', value: null },
      { key: 'empty', value: null },
    ])
  })
  it('decodes Buffer values as utf8', () => {
    const { txt } = decodeTxt({ k: Buffer.from('héllo', 'utf8') })
    expect(txt.k).toBe('héllo')
  })
})

describe('toDiscoveredService', () => {
  it('maps a bonjour service to the DiscoveredService shape', () => {
    const d = toDiscoveredService(sampleService)
    expect(d.key).toBe("andy's mac studio._airplay._tcp.local.")
    expect(d.serviceType).toBe('_airplay._tcp')
    expect(d.protocol).toBe('tcp')
    expect(d.port).toBe(7000)
    expect(d.hostname).toBe('Andy-Mac-Studio.local.')
    expect(d.addresses).toEqual(['172.16.20.157', 'fe80::1%en0'])
    expect(d.txt).toEqual({ model: 'Mac14,14' })
  })
})

describe('BonjourSource (injected factory)', () => {
  function fakeBonjour() {
    const handlers: Record<string, (s: BonjourLikeService) => void> = {}
    const browser: BrowserLike = {
      on: (event, cb) => {
        handlers[event] = cb
      },
      update: vi.fn(),
      expire: vi.fn(),
      stop: vi.fn(),
    }
    const engine: BonjourLike = { find: () => browser, destroy: vi.fn() }
    return { engine, browser, handlers }
  }

  it('emits an up SourceEvent mapped from a bonjour up event', () => {
    const f = fakeBonjour()
    const src = new BonjourSource({ createBonjour: () => f.engine })
    const seen = vi.fn()
    src.subscribe(seen)
    src.start()
    f.handlers['up']!(sampleService)
    expect(seen).toHaveBeenCalledWith({ type: 'up', service: expect.objectContaining({ key: "andy's mac studio._airplay._tcp.local." }) })
  })

  it('maps a bonjour down event to a down SourceEvent keyed by fqdn', () => {
    const f = fakeBonjour()
    const src = new BonjourSource({ createBonjour: () => f.engine })
    const seen = vi.fn()
    src.subscribe(seen)
    src.start()
    f.handlers['down']!(sampleService)
    expect(seen).toHaveBeenCalledWith({ type: 'down', key: "andy's mac studio._airplay._tcp.local." })
  })

  it('fans update() and expire() to the browser', () => {
    const f = fakeBonjour()
    const src = new BonjourSource({ createBonjour: () => f.engine })
    src.start()
    src.update()
    src.expire()
    expect(f.browser.update).toHaveBeenCalledTimes(1)
    expect(f.browser.expire).toHaveBeenCalledTimes(1)
  })

  it('skips engines whose factory returns null (e.g. no IPv6)', () => {
    const src = new BonjourSource({ createBonjour: (kind) => (kind === 'udp6' ? null : { find: () => ({ on() {}, update() {}, expire() {}, stop() {} }), destroy() {} }) })
    expect(() => {
      src.start()
      src.update()
      src.stop()
    }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/discovery/sources/BonjourSource.test.ts`
Expected: FAIL — "Failed to resolve import './BonjourSource'".

- [ ] **Step 3: Write minimal implementation (`BonjourSource.ts`)**

```ts
import { Bonjour } from 'bonjour-service'
import { networkInterfaces } from 'node:os'
import type { DiscoveredService, DiscoverySource, RawTxtEntry, SourceEvent } from '../../../shared/types'
import { instanceKey } from '../identity'

export interface BonjourLikeService {
  name: string
  type: string
  protocol: 'tcp' | 'udp'
  port: number
  host: string
  fqdn: string
  addresses?: string[]
  txt?: Record<string, unknown>
  ttl?: number
}

export interface BrowserLike {
  on(event: string, cb: (s: BonjourLikeService) => void): void
  update(): void
  expire(): void
  stop(): void
}

export interface BonjourLike {
  find(opts: null): BrowserLike
  destroy(): void
}

export type BonjourFactory = (kind: 'udp4' | 'udp6') => BonjourLike | null

export function decodeTxt(txt: Record<string, unknown>): { txt: Record<string, string>; rawTxt: RawTxtEntry[] } {
  const out: Record<string, string> = {}
  const raw: RawTxtEntry[] = []
  for (const [key, v] of Object.entries(txt)) {
    if (v === true || v === null || v === undefined) {
      raw.push({ key, value: null })
    } else if (Buffer.isBuffer(v)) {
      const s = v.toString('utf8')
      out[key] = s
      raw.push({ key, value: s })
    } else {
      const s = String(v)
      out[key] = s
      raw.push({ key, value: s })
    }
  }
  return { txt: out, rawTxt: raw }
}

export function toDiscoveredService(s: BonjourLikeService): DiscoveredService {
  const { txt, rawTxt } = decodeTxt(s.txt ?? {})
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
  }
}

function defaultIpv6InterfaceAddress(): string | undefined {
  const ifaces = networkInterfaces()
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv6' && !a.internal && a.address.toLowerCase().startsWith('fe80')) {
        return a.scopeid ? `${a.address}%${a.scopeid}` : a.address
      }
    }
  }
  return undefined
}

const defaultFactory: BonjourFactory = (kind) => {
  if (kind === 'udp4') return new Bonjour() as unknown as BonjourLike
  const iface = defaultIpv6InterfaceAddress()
  if (!iface) return null
  return new Bonjour({ type: 'udp6', ip: 'ff02::fb', interface: iface } as never) as unknown as BonjourLike
}

export class BonjourSource implements DiscoverySource {
  private readonly createBonjour: BonjourFactory
  private engines: BonjourLike[] = []
  private browsers: BrowserLike[] = []
  private listeners = new Set<(event: SourceEvent) => void>()

  constructor(options?: { createBonjour?: BonjourFactory }) {
    this.createBonjour = options?.createBonjour ?? defaultFactory
  }

  start(): void {
    for (const kind of ['udp4', 'udp6'] as const) {
      const engine = this.createBonjour(kind)
      if (!engine) continue
      const browser = engine.find(null)
      browser.on('up', (s) => this.emit({ type: 'up', service: toDiscoveredService(s) }))
      browser.on('srv-update', (s) => this.emit({ type: 'srv-update', service: toDiscoveredService(s) }))
      browser.on('txt-update', (s) => this.emit({ type: 'txt-update', service: toDiscoveredService(s) }))
      browser.on('down', (s) => this.emit({ type: 'down', key: instanceKey(s.fqdn) }))
      this.engines.push(engine)
      this.browsers.push(browser)
    }
  }

  stop(): void {
    for (const b of this.browsers) b.stop()
    for (const e of this.engines) e.destroy()
    this.browsers = []
    this.engines = []
  }

  update(): void {
    for (const b of this.browsers) b.update()
  }

  expire(): void {
    for (const b of this.browsers) b.expire()
  }

  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: SourceEvent): void {
    for (const l of [...this.listeners]) l(event)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/discovery/sources/BonjourSource.test.ts`
Expected: PASS (6 tests).

> Note: the injected-factory tests cover event mapping and command fan-out. The real udp4/udp6 socket behavior is verified by the manual smoke harness below — unit tests never open sockets.

- [ ] **Step 5: Create the smoke harness `scripts/discover.ts`**

```ts
import { DiscoveryManager, type ManagerEvent } from '../src/main/discovery/DiscoveryManager'
import { BonjourSource } from '../src/main/discovery/sources/BonjourSource'

const source = new BonjourSource()
const manager = new DiscoveryManager({
  source,
  onEvent(e: ManagerEvent) {
    if (e.type === 'snapshot') {
      console.log(`[snapshot] ${e.snapshot.hosts.length} hosts, ${e.snapshot.instances.length} instances`)
    } else if (e.type === 'status') {
      console.log(`[status] live=${e.status.live} scanning=${e.status.scanning}`)
    } else {
      const d = e.delta
      for (const i of d.upsertInstances ?? []) console.log(`  + ${i.serviceType.padEnd(22)} ${i.name}  @ ${i.hostId} :${i.port}`)
      for (const k of d.removeInstanceKeys ?? []) console.log(`  - ${k}`)
    }
  },
})

console.log('Browsing for mDNS services… (Ctrl+C to stop)')
manager.start()
process.on('SIGINT', () => {
  manager.stop()
  process.exit(0)
})
```

- [ ] **Step 6: Manual real-network verification**

Run: `pnpm smoke:discover`
Expected: within a few seconds you see `[snapshot] …` and a stream of `  + _<type>._<proto> <name> @ <host> :<port>` lines for services on your LAN (AirPlay, `_http`, `_ssh`, etc.).
- On macOS, if you see nothing, this is the Local Network permission gate (handled in Plan 4) — re-run from a Terminal that has been granted Local Network access, or confirm other browsers (e.g. `dns-sd -B _services._dns-sd._udp`) see services.
- Stop a service (e.g. quit an AirPlay receiver, or unplug a device): within ~1–31s you should see a matching `  - <key>` removal line (goodbye → fast; silent death → after the expire poll + 30s prune).

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/main/discovery/sources/BonjourSource.ts src/main/discovery/sources/BonjourSource.test.ts scripts/discover.ts
git commit -m "feat: BonjourSource udp4/udp6 adapter + real-network smoke harness"
```

---

## Self-Review (completed during authoring)

**Spec coverage (Plan 1's slice of the spec):**
- §3.2 discover-all-types via wildcard browser → BonjourSource `find(null)` per engine (Task 8). ✓
- §3.3.1 expire poll for silent departures → DiscoveryManager `tick()` calls `source.expire()` every `expireIntervalMs` (Task 7). ✓
- §3.3.2 dual-stack udp4+udp6 → BonjourSource two engines with null-skip for missing IPv6 (Task 8). ✓
- §3.3.3 dedupe by fqdn + union addresses → store keys by `service.key`; host addresses unioned (Task 5). ✓
- §3.3.4 address classification incl. `%zone` → `classifyAddress` (Task 2). ✓
- §3.3.5 presence + goodbye/expire + 30s prune → `markDown`/`prune` (Task 6) + Manager grace (Task 7). ✓
- §3.3.7 TXT fidelity (rawTxt for boolean keys) → `decodeTxt` (Task 8). ✓
- §5 data model + §8 testing (FakeSource seam, fixtures, fake timers) → Tasks 1,4,5,6,7. ✓
- Deferred to later plans (correctly out of scope here): IPC/preload/renderer (§4,6,7), settings persistence (§6), service-type dictionary + export formatters (§5,6 — used by UI), packaging + macOS permission (§3.4, Plan 4).

**Placeholder scan:** no TBD/TODO; every code + test step is complete. ✓
**Type consistency:** `DiscoverySource` (start/stop/update/expire/subscribe), `SourceEvent` (`up`/`srv-update`/`txt-update`/`down`), `DiscoveryDelta` field names, and `ManagerEvent` shapes are identical across Tasks 1, 4, 7, 8. ✓

## Known simplifications (v1, by design)

- A `down` from **either** the udp4 or udp6 engine marks the instance departed; if it is still live on the other stack it simply re-`up`s on the next response. Acceptable for default-interface dual-stack; revisit if per-engine presence tracking is needed.
- `resolve(key)` triggers a network-wide re-query rather than a single-instance query (bonjour-service browses at the type level). The UX (toast + bumped last-seen) lands in the renderer plan.

## Execution Handoff

After the last task, Plan 2 (Electron shell + IPC + preload + minimal renderer) consumes `DiscoveryManager` + `BonjourSource` unchanged — it wires `onEvent` to IPC `send` and the command methods to IPC `handle`.
