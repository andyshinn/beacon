# Beacon Electron Shell + IPC + Minimal Renderer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the runnable Electron app — main process runs the Plan 1 `DiscoveryManager` + `BonjourSource`, streams snapshot/delta/status to a sandboxed renderer over a typed `contextBridge` API, and a minimal React + Radix Themes view proves **live** discovery end-to-end.

**Architecture:** electron-forge (Vite plugin) builds three targets (main / preload / renderer). Main owns all sockets and the discovery engine; the renderer is `contextIsolation:true, sandbox:true` and reaches main only through a read-only `window.beacon` API. A zustand store applies snapshot/delta events into `Map`s and derives a row list. Full UI fidelity is a later plan — here we render just enough to see services appear and depart.

**Tech Stack:** electron-forge 8.0.0-alpha.9 (Vite plugin) · Vite · React 19 + Radix UI Themes · zustand · Vitest (+ happy-dom for one component test). Consumes Plan 1's `DiscoveryManager`/`BonjourSource`/`src/shared/types.ts` unchanged.

## This is Plan 2 of 4
1. Foundation & discovery engine — **DONE (merged to main)**
2. **Electron shell + IPC + preload + minimal renderer** ← this plan
3. Full renderer UI (lenses, detail, toolbar, search, live/pause, export, theming)
4. Packaging (forge makers + macOS Local Network permission)

Spec: `docs/superpowers/specs/2026-06-27-beacon-mdns-browser-design.md`.

## Global Constraints
- **Process boundary:** ALL sockets/discovery in **main**. Renderer is `contextIsolation:true, sandbox:true, nodeIntegration:false`; it touches main only via `window.beacon`.
- **Forge/Vite output (from installed `@electron-forge/plugin-vite@8.0.0-alpha.9` source):** main+preload build to `.vite/build/[basename].js`; renderer to `.vite/renderer/<name>/`. The renderer name is `main_window`, which injects the defines `MAIN_WINDOW_VITE_DEV_SERVER_URL` (string in dev, `undefined` when packaged) and `MAIN_WINDOW_VITE_NAME`. **There is no preload magic global** — reference the preload as `path.join(__dirname, 'preload.js')`. `package.json` `"main"` MUST contain `.vite/` or packaging throws.
- **Filename rule:** main and preload both build into `.vite/build/`, so their entry **basenames must differ**. Use `src/main/main.ts` → `main.js` and `src/preload/preload.ts` → `preload.js`. (This supersedes the spec's `index.ts` filenames.)
- **IPC channels (exact):** streaming `discovery:snapshot` / `discovery:delta` / `discovery:status`; commands `command:rescan` / `command:setLive` / `command:resolve` / `command:getSnapshot` / `command:openExternal`. Payloads are the Plan 1 types verbatim (`DiscoverySnapshot` / `DiscoveryDelta` / `DiscoveryStatus`) — all structured-clone-safe.
- **`openExternal` allowlist:** main opens only `^https?://` URLs (intentional Plan-2 limitation).
- **Theme:** `<Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">`.
- TypeScript `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` (every type-only import is `import type`). TDD where unit-testable. Frequent commits.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Version note (resolved from node_modules; Task 1 is the empirical gate)
Only `vite@5.4.21` is installed (via `vitest`). The forge alpha declares no Vite peer. **Start with `vite@^5.4.0` + `@vitejs/plugin-react@^4.7.0`** (plugin-react v4 supports Vite 5; keeps a single Vite shared with vitest). Task 1 verifies `electron-forge start` actually boots a window with this set. **If start fails on a Vite API mismatch**, the documented remediation ladder is: (a) bump to `vite@^6` + `@vitejs/plugin-react@^4`; (b) if still failing, `vite@^8` + `@vitejs/plugin-react@^5` (newest plugin-react supporting it) — accepting that vitest may then resolve its own separate Vite 5. Record which combination booted.

---

## File Structure
| File | Responsibility |
|------|----------------|
| `package.json` (modify) | `"main"`, start/package/make scripts, deps |
| `tsconfig.json` (modify) | add `jsx`, DOM libs, `vite/client` types so `.tsx` typechecks |
| `vitest.config.ts` (modify) | include `*.tsx` |
| `forge.config.ts` (create) | Forge: makers + VitePlugin(3 entries) + Fuses + AutoUnpackNatives |
| `vite.main.config.ts` / `vite.preload.config.ts` / `vite.renderer.config.ts` (create) | per-target Vite config |
| `index.html` (create) | renderer entry, mounts `/src/renderer/main.tsx` |
| `src/main/main.ts` (create) | Electron entry: window (mac hiddenInset) + load + wire IPC |
| `src/main/forge-vite-env.d.ts` (create) | types the `MAIN_WINDOW_VITE_*` globals |
| `src/main/ipc/registerDiscoveryIpc.ts` (create) | DiscoveryManager+BonjourSource ↔ IPC pump |
| `src/preload/preload.ts` (create) | `contextBridge` `window.beacon` (read-only) |
| `src/shared/ipc.ts` (create) | channel constants + payload aliases |
| `src/shared/beacon-api.ts` (create) | `BeaconApi` + `Unsubscribe` types |
| `src/preload/beacon-api.d.ts` (create) | `Window.beacon` global augmentation |
| `src/renderer/main.tsx` (create) | React 19 + Radix Theme + wire IPC→store |
| `src/renderer/App.tsx` (create) | minimal Radix list of instances |
| `src/renderer/store/discoveryStore.ts` (create) | zustand store: snapshot/delta → rows |
| `src/renderer/store/discoveryStore.test.ts` (create) | store unit tests (node env) |
| `src/renderer/App.test.tsx` (create) | RTL render smoke (happy-dom) |

---

## Task 1: Scaffold the Electron shell + boot smoke (empirical version gate)

**Files:** Modify `package.json`, `tsconfig.json`, `vitest.config.ts`. Create `forge.config.ts`, `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`, `index.html`, `src/main/main.ts`, `src/main/forge-vite-env.d.ts`, `src/preload/preload.ts` (stub), `src/renderer/main.tsx` (stub), `src/renderer/App.tsx` (stub).

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: a booting Electron app and the build config every later task relies on.

- [ ] **Step 1: Install deps**
```bash
pnpm add react-dom@^19.2.7 zustand@^5.0.0
pnpm add -D vite@^5.4.0 @vitejs/plugin-react@^4.7.0 @electron/fuses@^2.0.0 \
  @types/react@^19.2.0 @types/react-dom@^19.2.0 happy-dom@^15.0.0 \
  @testing-library/react@^16.0.0 @testing-library/dom@^10.0.0
```

- [ ] **Step 2: `package.json` — add `main` + scripts**
Add the top-level field `"main": ".vite/build/main.js"`, and merge into `"scripts"` (keep existing): `"start": "electron-forge start"`, `"package": "electron-forge package"`, `"make": "electron-forge make"`.

- [ ] **Step 3: `forge.config.ts`**
```ts
import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FuseV1Options, FuseVersion } from '@electron/fuses'

const config: ForgeConfig = {
  packagerConfig: { asar: true },
  rebuildConfig: {},
  makers: [new MakerSquirrel({}), new MakerZIP({}, ['darwin']), new MakerRpm({}), new MakerDeb({}), new MakerDMG({})],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}
export default config
```

- [ ] **Step 4: Vite configs**
`vite.main.config.ts`:
```ts
import { defineConfig } from 'vite'
export default defineConfig({
  resolve: { conditions: ['node'], mainFields: ['module', 'jsnext:main', 'jsnext'] },
})
```
`vite.preload.config.ts`:
```ts
import { defineConfig } from 'vite'
export default defineConfig({})
```
`vite.renderer.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
```

- [ ] **Step 5: `index.html` (project root)**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beacon</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: `src/main/forge-vite-env.d.ts`**
```ts
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
```

- [ ] **Step 7: `src/main/main.ts` (minimal window for the boot gate)**
```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    void win.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 8: `src/preload/preload.ts` (stub — real API in Task 4)**
```ts
// Real window.beacon API is added in Task 4.
export {}
```

- [ ] **Step 9: `src/renderer/App.tsx` (stub) + `src/renderer/main.tsx` (stub)**
`src/renderer/App.tsx`:
```tsx
import { Box, Heading, Text } from '@radix-ui/themes'
export function App() {
  return (
    <Box p="4">
      <Heading size="5" mb="2">Beacon</Heading>
      <Text color="gray">Shell is running. Discovery wiring lands in later tasks.</Text>
    </Box>
  )
}
```
`src/renderer/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
createRoot(container).render(
  <StrictMode>
    <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>,
)
```

- [ ] **Step 10: `tsconfig.json` — let `.tsx` typecheck**
In `compilerOptions`: set `"jsx": "react-jsx"`; change `"lib"` to `["ES2022", "DOM", "DOM.Iterable"]`; change `"types"` to `["node", "vite/client"]`. (Single root config keeps one `pnpm typecheck`.)

- [ ] **Step 11: `vitest.config.ts` — include tsx**
Change `include` to `['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}']`. Keep `environment: 'node'`.

- [ ] **Step 12: Verify typecheck + existing suite**
Run: `pnpm typecheck` → clean. Run: `pnpm test` → 39/39 still pass (Plan 1 untouched).

- [ ] **Step 13: BOOT GATE (manual)**
Run: `pnpm start`. Expected: an Electron window opens showing the dark Radix-themed "Beacon" shell (macOS: traffic lights inset into the toolbar area). Quit the app.
**If `electron-forge start` errors on a Vite version/API mismatch**, apply the remediation ladder from the Version note (bump Vite + matching plugin-react), re-run, and record the working combination in the commit body. Do not proceed to Step 14 until a window boots.

- [ ] **Step 14: Commit**
```bash
git add -A && git commit -m "feat: scaffold electron-forge + vite shell that boots a Radix window"
```

---

## Task 2: Shared IPC contract types

**Files:** Create `src/shared/ipc.ts`, `src/shared/beacon-api.ts`, `src/preload/beacon-api.d.ts`.

**Interfaces:**
- Consumes: Plan 1 `src/shared/types.ts` (`DiscoverySnapshot`/`DiscoveryDelta`/`DiscoveryStatus`).
- Produces: `IPC` channel constants; `SnapshotPayload`/`DeltaPayload`/`StatusPayload`; `BeaconApi`/`Unsubscribe`; `Window.beacon` augmentation — all consumed by Tasks 4/5/6.

- [ ] **Step 1: `src/shared/ipc.ts`**
```ts
import type { DiscoverySnapshot, DiscoveryDelta, DiscoveryStatus } from './types'

export const IPC = {
  snapshot: 'discovery:snapshot',
  delta: 'discovery:delta',
  status: 'discovery:status',
  rescan: 'command:rescan',
  setLive: 'command:setLive',
  resolve: 'command:resolve',
  getSnapshot: 'command:getSnapshot',
  openExternal: 'command:openExternal',
} as const

export type SnapshotPayload = DiscoverySnapshot
export type DeltaPayload = DiscoveryDelta
export type StatusPayload = DiscoveryStatus
```

- [ ] **Step 2: `src/shared/beacon-api.ts`**
```ts
import type { SnapshotPayload, DeltaPayload, StatusPayload } from './ipc'

export type Unsubscribe = () => void

export interface BeaconApi {
  onSnapshot(listener: (s: SnapshotPayload) => void): Unsubscribe
  onDelta(listener: (d: DeltaPayload) => void): Unsubscribe
  onStatus(listener: (s: StatusPayload) => void): Unsubscribe
  rescan(): Promise<void>
  setLive(on: boolean): Promise<void>
  resolve(key: string): Promise<void>
  getSnapshot(): Promise<SnapshotPayload>
  openExternal(url: string): Promise<void>
}
```

- [ ] **Step 3: `src/preload/beacon-api.d.ts`**
```ts
import type { BeaconApi } from '../shared/beacon-api'
declare global {
  interface Window {
    beacon: BeaconApi
  }
}
export {}
```

- [ ] **Step 4: Verify**
Run: `pnpm typecheck` → clean (confirms the contract compiles and the global augmentation is picked up).

- [ ] **Step 5: Commit**
```bash
git add src/shared/ipc.ts src/shared/beacon-api.ts src/preload/beacon-api.d.ts
git commit -m "feat: shared IPC channel + beacon API contract types"
```

---

## Task 3: Renderer discovery store (zustand) — TDD

**Files:** Create `src/renderer/store/discoveryStore.ts`, `src/renderer/store/discoveryStore.test.ts`.

**Interfaces:**
- Consumes: Plan 1 types (`DiscoverySnapshot`/`DiscoveryDelta`/`Host`/`Instance`).
- Produces: `useDiscoveryStore` (zustand) with `applySnapshot`/`applyDelta`, `InstanceRow`, and the stable `selectRows` selector (consumed by Tasks 6).

- [ ] **Step 1: Write the failing test (`discoveryStore.test.ts`, node env)**
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useDiscoveryStore, selectRows } from './discoveryStore'
import type { Host, Instance, DiscoverySnapshot } from '../../shared/types'

function host(id: string, ips: Array<[string, Host['addresses'][number]['family']]>): Host {
  return {
    id, displayName: id, hostname: id,
    addresses: ips.map(([value, family]) => ({ value, family })),
    firstSeen: 1, lastSeen: 1, present: true,
  }
}
function inst(key: string, name: string, serviceType: string, hostId: string): Instance {
  return { key, name, serviceType, protocol: 'tcp', port: 80, txt: {}, hostId, firstSeen: 1, lastSeen: 1, present: true }
}

beforeEach(() => {
  useDiscoveryStore.setState({ hosts: new Map(), instances: new Map(), rows: [] })
})

describe('discoveryStore', () => {
  it('applySnapshot replaces state and derives rows with ipv4-preferred primaryIp', () => {
    const snap: DiscoverySnapshot = {
      hosts: [host('h1.local.', [['fe80::1', 'linklocal'], ['10.0.0.5', 'ipv4']])],
      instances: [inst('a._http._tcp.local.', 'Alpha', '_http._tcp', 'h1.local.')],
    }
    useDiscoveryStore.getState().applySnapshot(snap)
    const rows = selectRows(useDiscoveryStore.getState())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Alpha', serviceType: '_http._tcp', primaryIp: '10.0.0.5' })
  })

  it('applyDelta upserts then removes hosts and instances', () => {
    const s = useDiscoveryStore.getState()
    s.applyDelta({ upsertHosts: [host('h1.local.', [['10.0.0.5', 'ipv4']])], upsertInstances: [inst('a._http._tcp.local.', 'Alpha', '_http._tcp', 'h1.local.')] })
    expect(selectRows(useDiscoveryStore.getState())).toHaveLength(1)
    s.applyDelta({ removeInstanceKeys: ['a._http._tcp.local.'], removeHostIds: ['h1.local.'] })
    expect(selectRows(useDiscoveryStore.getState())).toHaveLength(0)
  })

  it('primaryIp is null when the instance host is unknown or addressless', () => {
    useDiscoveryStore.getState().applyDelta({ upsertInstances: [inst('a._http._tcp.local.', 'Alpha', '_http._tcp', 'missing.local.')] })
    expect(selectRows(useDiscoveryStore.getState())[0]!.primaryIp).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm exec vitest run src/renderer/store/discoveryStore.test.ts` → FAIL (`Failed to resolve import './discoveryStore'`).

- [ ] **Step 3: Implement `discoveryStore.ts`**
```ts
import { create } from 'zustand'
import type { DiscoverySnapshot, DiscoveryDelta, Host, Instance } from '../../shared/types'

export interface InstanceRow {
  key: string
  name: string
  serviceType: string
  primaryIp: string | null
}

interface DiscoveryState {
  hosts: Map<string, Host>
  instances: Map<string, Instance>
  rows: InstanceRow[]
  applySnapshot: (snapshot: DiscoverySnapshot) => void
  applyDelta: (delta: DiscoveryDelta) => void
}

const FAMILY_ORDER = { ipv4: 0, ipv6: 1, linklocal: 2, loopback: 3 } as const

function primaryIp(host: Host | undefined): string | null {
  if (!host || host.addresses.length === 0) return null
  const best = [...host.addresses].sort((a, b) => FAMILY_ORDER[a.family] - FAMILY_ORDER[b.family])[0]
  return best ? best.value : null
}

function buildRows(hosts: Map<string, Host>, instances: Map<string, Instance>): InstanceRow[] {
  return [...instances.values()]
    .map((i) => ({ key: i.key, name: i.name, serviceType: i.serviceType, primaryIp: primaryIp(hosts.get(i.hostId)) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.serviceType.localeCompare(b.serviceType))
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  hosts: new Map(),
  instances: new Map(),
  rows: [],
  applySnapshot: (snapshot) => {
    const hosts = new Map(snapshot.hosts.map((h) => [h.id, h] as const))
    const instances = new Map(snapshot.instances.map((i) => [i.key, i] as const))
    set({ hosts, instances, rows: buildRows(hosts, instances) })
  },
  applyDelta: (delta) => {
    const hosts = new Map(get().hosts)
    const instances = new Map(get().instances)
    for (const h of delta.upsertHosts ?? []) hosts.set(h.id, h)
    for (const id of delta.removeHostIds ?? []) hosts.delete(id)
    for (const i of delta.upsertInstances ?? []) instances.set(i.key, i)
    for (const k of delta.removeInstanceKeys ?? []) instances.delete(k)
    set({ hosts, instances, rows: buildRows(hosts, instances) })
  },
}))

export const selectRows = (s: DiscoveryState): InstanceRow[] => s.rows
```

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm exec vitest run src/renderer/store/discoveryStore.test.ts` → PASS (3 tests). Then `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**
```bash
git add src/renderer/store/discoveryStore.ts src/renderer/store/discoveryStore.test.ts
git commit -m "feat: renderer zustand store applying discovery snapshot/delta"
```

---

## Task 4: Preload bridge (`window.beacon`)

**Files:** Modify `src/preload/preload.ts`.

**Interfaces:**
- Consumes: `IPC` (Task 2), `BeaconApi`/`Unsubscribe` (Task 2), `SnapshotPayload`/`DeltaPayload`/`StatusPayload` (Task 2).
- Produces: `window.beacon` at runtime (verified live in Task 6's boot).

- [ ] **Step 1: Implement `src/preload/preload.ts`**
```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { SnapshotPayload, DeltaPayload, StatusPayload } from '../shared/ipc'
import type { BeaconApi, Unsubscribe } from '../shared/beacon-api'

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_e: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const beacon: BeaconApi = {
  onSnapshot: (l) => subscribe<SnapshotPayload>(IPC.snapshot, l),
  onDelta: (l) => subscribe<DeltaPayload>(IPC.delta, l),
  onStatus: (l) => subscribe<StatusPayload>(IPC.status, l),
  rescan: () => ipcRenderer.invoke(IPC.rescan) as Promise<void>,
  setLive: (on) => ipcRenderer.invoke(IPC.setLive, on) as Promise<void>,
  resolve: (key) => ipcRenderer.invoke(IPC.resolve, key) as Promise<void>,
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<SnapshotPayload>,
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>,
}

contextBridge.exposeInMainWorld('beacon', beacon)
```

- [ ] **Step 2: Verify**
Run: `pnpm typecheck` → clean (confirms the preload satisfies `BeaconApi` and imports resolve). (Runtime presence of `window.beacon` is verified in Task 6's boot.)

- [ ] **Step 3: Commit**
```bash
git add src/preload/preload.ts
git commit -m "feat: contextBridge preload exposing read-only window.beacon"
```

---

## Task 5: Main-process IPC registration (DiscoveryManager ↔ renderer)

**Files:** Create `src/main/ipc/registerDiscoveryIpc.ts`. Modify `src/main/main.ts` (call it).

**Interfaces:**
- Consumes: Plan 1 `DiscoveryManager`, `ManagerEvent` (`src/main/discovery/DiscoveryManager`), `BonjourSource` (`src/main/discovery/sources/BonjourSource`); `IPC` (Task 2).
- Produces: `registerDiscoveryIpc(win: BrowserWindow): void`.

- [ ] **Step 1: Implement `src/main/ipc/registerDiscoveryIpc.ts`**
```ts
import { BrowserWindow, ipcMain, shell } from 'electron'
import { DiscoveryManager } from '../discovery/DiscoveryManager'
import type { ManagerEvent } from '../discovery/DiscoveryManager'
import { BonjourSource } from '../discovery/sources/BonjourSource'
import { IPC } from '../../shared/ipc'

export function registerDiscoveryIpc(win: BrowserWindow): void {
  const wc = win.webContents
  let ready = false
  const pending: Array<{ channel: string; payload: unknown }> = []

  const push = (channel: string, payload: unknown): void => {
    if (wc.isDestroyed()) return
    if (!ready) {
      pending.push({ channel, payload })
      return
    }
    wc.send(channel, payload)
  }

  const onEvent = (e: ManagerEvent): void => {
    if (e.type === 'snapshot') push(IPC.snapshot, e.snapshot)
    else if (e.type === 'delta') push(IPC.delta, e.delta)
    else push(IPC.status, e.status)
  }

  const manager = new DiscoveryManager({ source: new BonjourSource(), onEvent })

  // Commands
  ipcMain.handle(IPC.rescan, () => manager.rescan())
  ipcMain.handle(IPC.setLive, (_e, on: unknown) => manager.setLive(Boolean(on)))
  ipcMain.handle(IPC.resolve, (_e, key: unknown) => {
    if (typeof key === 'string') manager.resolve(key)
  })
  ipcMain.handle(IPC.getSnapshot, () => manager.getSnapshot())
  ipcMain.handle(IPC.openExternal, async (_e, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  // Readiness: buffer until first load; re-snapshot on reload.
  wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) ready = false
  })
  wc.on('did-finish-load', () => {
    ready = true
    if (pending.length) {
      for (const m of pending.splice(0)) if (!wc.isDestroyed()) wc.send(m.channel, m.payload)
    } else {
      // reload: rebuild the freshly-reset renderer store
      push(IPC.snapshot, manager.getSnapshot())
    }
  })

  win.on('closed', () => {
    manager.stop()
    for (const ch of [IPC.rescan, IPC.setLive, IPC.resolve, IPC.getSnapshot, IPC.openExternal]) {
      ipcMain.removeHandler(ch)
    }
  })

  manager.start() // emits initial snapshot + status synchronously (buffered until load)
}
```

- [ ] **Step 2: Wire it into `src/main/main.ts`**
Add `import { registerDiscoveryIpc } from './ipc/registerDiscoveryIpc'`. In `createWindow`, **before** the `loadURL`/`loadFile` call, add `registerDiscoveryIpc(win)`. (The buffer captures the synchronous initial snapshot/status from `manager.start()`.)

- [ ] **Step 3: Verify**
Run: `pnpm typecheck` → clean. Run: `pnpm test` → 39/39 still pass.

- [ ] **Step 4: Commit**
```bash
git add src/main/ipc/registerDiscoveryIpc.ts src/main/main.ts
git commit -m "feat: main-process IPC wiring DiscoveryManager to the renderer"
```

---

## Task 6: Renderer wiring + minimal live UI

**Files:** Modify `src/renderer/main.tsx`, `src/renderer/App.tsx`. Create `src/renderer/App.test.tsx`.

**Interfaces:**
- Consumes: `useDiscoveryStore`/`selectRows` (Task 3), `window.beacon` (Tasks 2/4).
- Produces: the running end-to-end app.

- [ ] **Step 1: Replace `src/renderer/main.tsx` to wire IPC → store**
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'
import { App } from './App'
import { useDiscoveryStore } from './store/discoveryStore'

const { applySnapshot, applyDelta } = useDiscoveryStore.getState()
window.beacon.onSnapshot((snapshot) => applySnapshot(snapshot))
window.beacon.onDelta((delta) => applyDelta(delta))
// window.beacon.onStatus(...) — wired in Plan 3 (live/scanning indicators).

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')
createRoot(container).render(
  <StrictMode>
    <Theme appearance="dark" accentColor="indigo" grayColor="slate" radius="medium">
      <App />
    </Theme>
  </StrictMode>,
)
```

- [ ] **Step 2: Replace `src/renderer/App.tsx` with the live list**
```tsx
import { Box, Flex, Heading, Text, Code, Card } from '@radix-ui/themes'
import { useDiscoveryStore, selectRows } from './store/discoveryStore'

export function App() {
  const rows = useDiscoveryStore(selectRows)
  return (
    <Box p="4">
      <Heading size="5" mb="3">
        Beacon — {rows.length} instance{rows.length === 1 ? '' : 's'}
      </Heading>
      <Flex direction="column" gap="2">
        {rows.map((r) => (
          <Card key={r.key}>
            <Flex justify="between" align="center" gap="3">
              <Text weight="medium">{r.name}</Text>
              <Code variant="ghost">{r.serviceType}</Code>
              <Text color="gray">{r.primaryIp ?? '—'}</Text>
            </Flex>
          </Card>
        ))}
        {rows.length === 0 && <Text color="gray">Scanning the local network…</Text>}
      </Flex>
    </Box>
  )
}
```

- [ ] **Step 3: `src/renderer/App.test.tsx` (happy-dom RTL render smoke)**
```tsx
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { App } from './App'
import { useDiscoveryStore } from './store/discoveryStore'
import type { Host, Instance } from '../shared/types'

const h: Host = { id: 'h1.local.', displayName: 'h1', hostname: 'h1.local.', addresses: [{ value: '10.0.0.5', family: 'ipv4' }], firstSeen: 1, lastSeen: 1, present: true }
const i: Instance = { key: 'a._http._tcp.local.', name: 'Alpha', serviceType: '_http._tcp', protocol: 'tcp', port: 80, txt: {}, hostId: 'h1.local.', firstSeen: 1, lastSeen: 1, present: true }

beforeEach(() => {
  useDiscoveryStore.setState({ hosts: new Map(), instances: new Map(), rows: [] })
})

describe('App', () => {
  it('renders the empty state when there are no instances', () => {
    render(<Theme><App /></Theme>)
    expect(screen.getByText(/Scanning the local network/i)).toBeTruthy()
  })
  it('renders a discovered instance row', () => {
    useDiscoveryStore.getState().applySnapshot({ hosts: [h], instances: [i] })
    render(<Theme><App /></Theme>)
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('_http._tcp')).toBeTruthy()
    expect(screen.getByText('10.0.0.5')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Verify automated**
Run: `pnpm exec vitest run src/renderer/App.test.tsx` → PASS (2 tests). Run: `pnpm test` → all green. Run: `pnpm typecheck` → clean.

- [ ] **Step 5: BOOT GATE (manual — end-to-end)**
Run: `pnpm start`. Expected: the window opens and, within a few seconds, fills with discovered LAN services (name · `_service._proto` · IP), updating as devices appear/depart. On macOS, grant the **Local Network** permission prompt if it appears (full handling is Plan 4); if the list stays empty, that prompt/permission is the likely cause — confirm with `dns-sd -B _services._dns-sd._udp` in a terminal. Also confirm `window.beacon` is defined (DevTools console) and a reload (⌘R) repopulates the list.

- [ ] **Step 6: Commit**
```bash
git add src/renderer/main.tsx src/renderer/App.tsx src/renderer/App.test.tsx
git commit -m "feat: wire renderer to live discovery and render instance list"
```

---

## Self-Review (completed during authoring)

**Spec coverage (Plan 2's slice):** process boundary (sandbox renderer, main owns sockets) ✓ Task 1/5; typed contextBridge IPC contract ✓ Tasks 2/4; DiscoveryManager+BonjourSource in main streamed to renderer ✓ Task 5; zustand store fed by deltas ✓ Task 3; minimal Radix UI proving live discovery ✓ Task 6; macOS hiddenInset chrome ✓ Task 1. Deferred (correctly): full lenses/detail/toolbar/search/export/live-pause/persistence/service-type dictionary → Plan 3; signing/permission Info.plist → Plan 4.
**Placeholder scan:** every step carries concrete code/commands; the only manual gates are the two `pnpm start` boots (unavoidable — GUI + real multicast have no vitest substitute) and they have explicit expected outcomes.
**Type consistency:** `BeaconApi` (Task 2) is implemented by the preload (Task 4) and consumed via `Window.beacon` (Task 2 d.ts) in the renderer (Task 6); `IPC` channel constants are shared by preload (Task 4) and main (Task 5); `DiscoverySnapshot`/`DiscoveryDelta` payloads match Plan 1 verbatim; store `applySnapshot`/`applyDelta`/`selectRows` (Task 3) are used in Task 6.

## Known risks / notes
- **Forge-8-alpha × Vite version** is the top risk — Task 1's boot gate resolves it empirically with a documented remediation ladder.
- The two `pnpm start` gates require a human (or a screenshotting `/run`) to confirm the window visually; the automated suite covers all pure logic.
- `resolve()` is exposed but maps to a network-wide re-query (Plan 1 v1 behavior); the resolve UI is Plan 3.
- macOS Local Network permission may suppress results on first run; robust handling (Info.plist string + health-check UI) is Plan 4.
