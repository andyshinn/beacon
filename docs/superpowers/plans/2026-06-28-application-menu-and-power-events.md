# Application Menu + powerMonitor Wake Restart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Beacon a real application menu (commands, ⌘-accelerators, live-state reflection) and make discovery recover after sleep by restarting the source on `resume`.

**Architecture:** powerMonitor is pure main-process. The menu uses hybrid routing: a pure `buildMenuTemplate` produces the template; renderer-meaningful clicks go through a `menu:command` channel to a renderer dispatcher that reuses existing `commands.ts`; Back/Forward run in main against `webContents.navigationHistory`. The renderer pushes `{ live, mode }` over `menu:state` so the menu can reflect state; nav enablement is derived in main.

**Tech Stack:** Electron 42 (`Menu`, `app`, `powerMonitor`, `webContents.navigationHistory`), TypeScript, React 19, zustand 5, Vitest 4 (Biome for lint/format), pnpm.

**Spec:** [docs/superpowers/specs/2026-06-28-application-menu-and-power-events-design.md](../specs/2026-06-28-application-menu-and-power-events-design.md)

## Global Constraints

- **Package manager: pnpm.** Run one test file: `pnpm test <path>` (vitest filters by filename). Full gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- **Indentation is tabs** (Biome enforces). After each task run `pnpm lint:fix` to normalize whitespace; the code blocks below use spaces for readability.
- **Security invariants stay intact:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer reaches main only through `contextBridge`/`window.beacon` — never expose `ipcRenderer` directly. Preload stays CJS-compatible.
- **Keep pure logic free of runtime `electron` imports** (type-only `import type` is fine) so the `node` Vitest project can import it. Modules that import `electron` at runtime (`installAppMenu.ts`, `main.ts`, `registerDiscoveryIpc.ts`) are not unit-tested — verify them via `pnpm typecheck` + manual run.
- **`powerMonitor` is only valid after `app` is ready.** It is wired inside `registerDiscoveryIpc`, which runs from `createWindow` inside `app.whenReady()`.
- **macOS-only command:** "Open Local Network Settings" is a macOS-only deep link; the menu item exists only when `process.platform === "darwin"` and lives in the app menu. It does NOT appear on Windows/Linux.
- **Don't disturb other working-tree changes** on this branch (the list/window-polish work). Stage only the files each task names.

---

## Task 1: `DiscoveryManager.restartSource()` + FakeSource call counters

Restart the discovery source (rebinds sockets) while live, preserving the store, with a scanning-status blip. DRY the blip out of `rescan`.

**Files:**
- Modify: `src/main/discovery/DiscoveryManager.ts`
- Modify: `src/main/discovery/sources/FakeSource.ts` (add `startCalls`/`stopCalls`)
- Test: `src/main/discovery/DiscoveryManager.test.ts`

**Interfaces:**
- Produces: `DiscoveryManager.restartSource(): void` — no-op when paused; else `source.stop()` then `source.start()` then a scanning blip. Consumed by Task 3.
- Produces: `FakeSource.startCalls: number`, `FakeSource.stopCalls: number`.

- [ ] **Step 1: Add call counters to FakeSource**

In `src/main/discovery/sources/FakeSource.ts`, add two counters and bump them:

```ts
export class FakeSource implements DiscoverySource {
  started = false;
  startCalls = 0;
  stopCalls = 0;
  updateCalls = 0;
  expireCalls = 0;
  private listeners = new Set<(event: SourceEvent) => void>();

  start(): void {
    this.started = true;
    this.startCalls++;
  }
  stop(): void {
    this.started = false;
    this.stopCalls++;
  }
  // update/expire/subscribe/emit unchanged
```

- [ ] **Step 2: Write the failing tests**

Append to `src/main/discovery/DiscoveryManager.test.ts` (inside the `describe`):

```ts
it("restartSource stops then restarts the source while live, with a scanning blip", () => {
  const source = new FakeSource();
  const { events, onEvent } = collector();
  const mgr = new DiscoveryManager({ source, onEvent, scanWindowMs: 1200 });
  mgr.start();
  expect(source.startCalls).toBe(1);

  mgr.restartSource();

  expect(source.stopCalls).toBe(1);
  expect(source.startCalls).toBe(2);
  expect(source.started).toBe(true);
  expect(events).toContainEqual({ type: "status", status: { live: true, scanning: true } });
  vi.advanceTimersByTime(1200);
  expect(events).toContainEqual({ type: "status", status: { live: true, scanning: false } });
});

it("restartSource is a no-op when paused", () => {
  const source = new FakeSource();
  const { onEvent } = collector();
  const mgr = new DiscoveryManager({ source, onEvent });
  mgr.start();
  mgr.setLive(false);
  const stops = source.stopCalls;
  const starts = source.startCalls;

  mgr.restartSource();

  expect(source.stopCalls).toBe(stops);
  expect(source.startCalls).toBe(starts);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/main/discovery/DiscoveryManager.test.ts`
Expected: FAIL — `mgr.restartSource is not a function`.

- [ ] **Step 4: Implement `restartSource` and extract the scan blip**

In `src/main/discovery/DiscoveryManager.ts`, replace the `rescan()` method and add `restartSource()` + a private `scanBlip()`:

```ts
rescan(): void {
  this.source.update();
  this.scanBlip();
}

restartSource(): void {
  if (!this.live) return;
  this.source.stop();
  this.source.start();
  this.scanBlip();
}

resolve(_key: string): void {
  // v1: a targeted resolve is a network re-query; the engine re-queries all.
  this.source.update();
}

private scanBlip(): void {
  this.emitStatus(true);
  if (this.scanTimer) clearTimeout(this.scanTimer);
  this.scanTimer = setTimeout(() => this.emitStatus(false), this.scanWindowMs);
}
```

(The manager's source subscription survives `stop()/start()` — both `FakeSource` and `BonjourSource` keep their listener set independent of the engines/records, so no re-subscribe is needed.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/main/discovery/DiscoveryManager.test.ts`
Expected: PASS — all manager tests green (the existing `rescan` test still passes; behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/main/discovery/DiscoveryManager.ts src/main/discovery/sources/FakeSource.ts src/main/discovery/DiscoveryManager.test.ts
git commit -m "feat(discovery): add DiscoveryManager.restartSource for wake recovery"
```

---

## Task 2: `installPowerEvents` (resume → debounced restart)

Pure module (no `electron` import) that subscribes to a power monitor's `resume` and, when live, schedules a restart after a settle delay.

**Files:**
- Create: `src/main/powerEvents.ts`
- Test: `src/main/powerEvents.test.ts`

**Interfaces:**
- Produces: `installPowerEvents(deps: PowerEventsDeps): () => void` (returns teardown).
- Produces types: `PowerMonitorLike`, `PowerEventsDeps`. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/main/powerEvents.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { installPowerEvents, type PowerMonitorLike } from "./powerEvents";

function fakeMonitor() {
  const handlers: Record<string, Array<() => void>> = {};
  const m: PowerMonitorLike & { emit: (e: string) => void; count: (e: string) => number } = {
    on: (e, cb) => {
      (handlers[e] ??= []).push(cb);
    },
    off: (e, cb) => {
      handlers[e] = (handlers[e] ?? []).filter((h) => h !== cb);
    },
    emit: (e) => {
      for (const h of [...(handlers[e] ?? [])]) h();
    },
    count: (e) => (handlers[e] ?? []).length,
  };
  return m;
}

function fakeClock() {
  let seq = 0;
  const timers = new Map<number, () => void>();
  return {
    setTimer: ((cb: () => void) => {
      const id = ++seq;
      timers.set(id, cb);
      return id as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimer: ((id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    }) as typeof clearTimeout,
    fire: () => {
      for (const [id, cb] of [...timers]) {
        timers.delete(id);
        cb();
      }
    },
    pending: () => timers.size,
  };
}

describe("installPowerEvents", () => {
  it("restarts once after the settle delay when live on resume", () => {
    const monitor = fakeMonitor();
    const clock = fakeClock();
    const restart = vi.fn();
    installPowerEvents({ powerMonitor: monitor, isLive: () => true, restart, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

    monitor.emit("resume");
    expect(restart).not.toHaveBeenCalled(); // waits for settle delay
    clock.fire();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("does nothing when paused on resume", () => {
    const monitor = fakeMonitor();
    const clock = fakeClock();
    const restart = vi.fn();
    installPowerEvents({ powerMonitor: monitor, isLive: () => false, restart, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

    monitor.emit("resume");
    expect(clock.pending()).toBe(0);
    clock.fire();
    expect(restart).not.toHaveBeenCalled();
  });

  it("debounces multiple resumes into a single restart", () => {
    const monitor = fakeMonitor();
    const clock = fakeClock();
    const restart = vi.fn();
    installPowerEvents({ powerMonitor: monitor, isLive: () => true, restart, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

    monitor.emit("resume");
    monitor.emit("resume");
    expect(clock.pending()).toBe(1);
    clock.fire();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("re-checks live at fire time and skips restart if paused since resume", () => {
    const monitor = fakeMonitor();
    const clock = fakeClock();
    const restart = vi.fn();
    let live = true;
    installPowerEvents({ powerMonitor: monitor, isLive: () => live, restart, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

    monitor.emit("resume");
    live = false; // user pauses during the settle window
    clock.fire();
    expect(restart).not.toHaveBeenCalled();
  });

  it("teardown removes the handler and cancels a pending restart", () => {
    const monitor = fakeMonitor();
    const clock = fakeClock();
    const restart = vi.fn();
    const teardown = installPowerEvents({ powerMonitor: monitor, isLive: () => true, restart, setTimer: clock.setTimer, clearTimer: clock.clearTimer });

    monitor.emit("resume");
    teardown();
    expect(monitor.count("resume")).toBe(0);
    expect(clock.pending()).toBe(0);
    clock.fire();
    expect(restart).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/main/powerEvents.test.ts`
Expected: FAIL — cannot find module `./powerEvents`.

- [ ] **Step 3: Implement `installPowerEvents`**

Create `src/main/powerEvents.ts`:

```ts
export interface PowerMonitorLike {
  on(event: "resume", listener: () => void): void;
  off(event: "resume", listener: () => void): void;
}

export interface PowerEventsDeps {
  powerMonitor: PowerMonitorLike;
  isLive: () => boolean;
  restart: () => void;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

// On wake from sleep the network (and the sockets' bound interface) often changed,
// so a live discovery session must rebind its sockets. We wait a short settle delay
// after `resume` to let the OS bring the interface back up before restarting, and
// debounce repeated resume events into one restart.
export function installPowerEvents(deps: PowerEventsDeps): () => void {
  const settleMs = deps.settleMs ?? 2000;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const onResume = (): void => {
    if (!deps.isLive()) return;
    if (pending !== undefined) clearTimer(pending);
    pending = setTimer(() => {
      pending = undefined;
      if (deps.isLive()) deps.restart();
    }, settleMs);
  };

  deps.powerMonitor.on("resume", onResume);

  return () => {
    deps.powerMonitor.off("resume", onResume);
    if (pending !== undefined) {
      clearTimer(pending);
      pending = undefined;
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/main/powerEvents.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/main/powerEvents.ts src/main/powerEvents.test.ts
git commit -m "feat(power): installPowerEvents schedules a debounced restart on resume"
```

---

## Task 3: Wire powerEvents into discovery IPC

Connect `installPowerEvents` to the real `powerMonitor` and the manager's `restartSource`, with teardown on window close.

**Files:**
- Modify: `src/main/ipc/registerDiscoveryIpc.ts`

**Interfaces:**
- Consumes: `installPowerEvents` (Task 2), `manager.restartSource()` and `manager.getStatus()` (Task 1 / existing).

- [ ] **Step 1: Import `powerMonitor` and `installPowerEvents`**

In `src/main/ipc/registerDiscoveryIpc.ts`, extend the electron import and add the module import:

```ts
import { type BrowserWindow, ipcMain, powerMonitor, shell } from "electron";
import { installPowerEvents } from "../powerEvents";
```

- [ ] **Step 2: Install powerEvents after the manager is created**

Immediately after the `const manager = new DiscoveryManager({ ... });` block, add:

```ts
const teardownPower = installPowerEvents({
  powerMonitor,
  isLive: () => manager.getStatus().live,
  restart: () => manager.restartSource(),
});
```

- [ ] **Step 3: Tear it down on window close**

In the existing `win.on("closed", () => { ... })` handler, add `teardownPower();` as the first line (before `manager.stop()`):

```ts
win.on("closed", () => {
  teardownPower();
  manager.stop();
  for (const ch of [
    // ...unchanged handler list...
  ]) {
    ipcMain.removeHandler(ch);
  }
});
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (`powerMonitor` structurally satisfies `PowerMonitorLike`.)

- [ ] **Step 5: Manual verification**

Run: `pnpm start`. With discovery live, sleep the Mac (or `pmset sleepnow`), switch Wi-Fi networks if possible, then wake. Expected: within ~2s the status shows a brief "scanning" blip and the list repopulates from fresh announcements. Pausing discovery first → no restart on wake.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/registerDiscoveryIpc.ts
git commit -m "feat(power): restart discovery on system resume"
```

---

## Task 4: Menu IPC contract + preload bridge

Add the two menu channels, the `MenuCommand`/`MenuStatePayload` types, the `BeaconApi` methods, and their preload implementations.

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/beacon-api.ts`
- Modify: `src/preload/preload.ts`

**Interfaces:**
- Produces: `IPC.menuCommand = "menu:command"`, `IPC.menuState = "menu:state"`.
- Produces types: `ViewMode = "service" | "host" | "ip" | "all"`; `MenuCommand`; `MenuStatePayload = { live: boolean; mode: ViewMode }`.
- Produces `BeaconApi.onMenuCommand(listener): Unsubscribe` and `BeaconApi.sendMenuState(state): void`. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Extend the IPC contract**

In `src/shared/ipc.ts`, add the two channels to the `IPC` object and append the new types:

```ts
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
  menuCommand: "menu:command",
  menuState: "menu:state",
} as const;

// View modes mirror the renderer's settingsStore `Lens`; kept here so the IPC
// contract (and the main process) can reference them without importing the renderer.
export type ViewMode = "service" | "host" | "ip" | "all";

export type MenuCommand =
  | "rescan"
  | "toggleLive"
  | `view:${ViewMode}`
  | "focusSearch"
  | "export:json"
  | "export:csv"
  | "export:txt"
  | "openLocalNetworkSettings";

export interface MenuStatePayload {
  live: boolean;
  mode: ViewMode;
}
```

- [ ] **Step 2: Extend the BeaconApi type**

In `src/shared/beacon-api.ts`, import the new types and add two methods:

```ts
import type { DeltaPayload, HealthPayload, MenuCommand, MenuStatePayload, SnapshotPayload, StatusPayload } from "./ipc";
```

Add inside the `BeaconApi` interface (after `openLocalNetworkSettings`):

```ts
  onMenuCommand(listener: (cmd: MenuCommand) => void): Unsubscribe;
  sendMenuState(state: MenuStatePayload): void;
```

- [ ] **Step 3: Implement them in preload**

In `src/preload/preload.ts`, import the new types and add the two implementations to the `beacon` object:

```ts
import type { DeltaPayload, HealthPayload, MenuCommand, MenuStatePayload, SnapshotPayload, StatusPayload } from "../shared/ipc";
```

Add to the `const beacon: BeaconApi = { ... }` literal (after `openLocalNetworkSettings`):

```ts
  onMenuCommand: (l) => subscribe<MenuCommand>(IPC.menuCommand, l),
  sendMenuState: (state: MenuStatePayload) => ipcRenderer.send(IPC.menuState, state),
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. The `BeaconApi` is fully implemented by preload; `window.beacon` now exposes the menu bridge.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/shared/beacon-api.ts src/preload/preload.ts
git commit -m "feat(ipc): add menu command + state channels to the beacon bridge"
```

---

## Task 5: Pure `buildMenuTemplate`

The unit-tested core: a pure function returning the Electron menu template for a given state. Type-only `electron` import (no runtime dependency).

**Files:**
- Create: `src/main/appMenu.ts`
- Test: `src/main/appMenu.test.ts`

**Interfaces:**
- Produces: `buildMenuTemplate(state: MenuState, deps: MenuBuildDeps): MenuItemConstructorOptions[]`.
- Produces types: `MenuState = { live, viewMode, canGoBack, canGoForward }`, `MenuBuildDeps = { platform, appName, onCommand, onBack, onForward }`. Consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/main/appMenu.test.ts`:

```ts
import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildMenuTemplate, type MenuBuildDeps, type MenuState } from "./appMenu";

type Tmpl = MenuItemConstructorOptions[];

function deps(over: Partial<MenuBuildDeps> = {}): MenuBuildDeps {
  return { platform: "darwin", appName: "Beacon", onCommand: vi.fn(), onBack: vi.fn(), onForward: vi.fn(), ...over };
}
const base: MenuState = { live: true, viewMode: "service", canGoBack: false, canGoForward: false };

function menu(t: Tmpl, label: string): MenuItemConstructorOptions | undefined {
  return t.find((m) => m.label === label);
}
function sub(t: Tmpl, label: string): MenuItemConstructorOptions[] {
  return (menu(t, label)?.submenu ?? []) as MenuItemConstructorOptions[];
}
function item(t: Tmpl, menuLabel: string, itemLabel: string): MenuItemConstructorOptions | undefined {
  return sub(t, menuLabel).find((i) => i.label === itemLabel);
}

describe("buildMenuTemplate", () => {
  it("flips the Pause/Resume label with live state", () => {
    expect(item(buildMenuTemplate({ ...base, live: true }, deps()), "Discovery", "Pause Discovery")).toBeDefined();
    expect(item(buildMenuTemplate({ ...base, live: false }, deps()), "Discovery", "Resume Discovery")).toBeDefined();
  });

  it("checks exactly the active view item", () => {
    const t = buildMenuTemplate({ ...base, viewMode: "host" }, deps());
    expect(item(t, "View", "Hosts")?.checked).toBe(true);
    expect(item(t, "View", "Services")?.checked).toBe(false);
    expect(item(t, "View", "IPs")?.checked).toBe(false);
    expect(item(t, "View", "All")?.checked).toBe(false);
  });

  it("enables Back/Forward per nav state", () => {
    const off = buildMenuTemplate(base, deps());
    expect(item(off, "History", "Back")?.enabled).toBe(false);
    expect(item(off, "History", "Forward")?.enabled).toBe(false);
    const on = buildMenuTemplate({ ...base, canGoBack: true, canGoForward: true }, deps());
    expect(item(on, "History", "Back")?.enabled).toBe(true);
    expect(item(on, "History", "Forward")?.enabled).toBe(true);
  });

  it("routes command clicks to onCommand", () => {
    const d = deps();
    const t = buildMenuTemplate(base, d);
    (item(t, "View", "Hosts")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("view:host");
    (item(t, "Discovery", "Rescan")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("rescan");
    (item(t, "Discovery", "Pause Discovery")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("toggleLive");
    (item(t, "Edit", "Find")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("focusSearch");
    (item(t, "File", "Export as JSON")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("export:json");
    (item(t, "File", "Copy as Text")?.click as () => void)();
    expect(d.onCommand).toHaveBeenCalledWith("export:txt");
  });

  it("routes Back/Forward clicks to their deps", () => {
    const d = deps();
    const t = buildMenuTemplate({ ...base, canGoBack: true, canGoForward: true }, d);
    (item(t, "History", "Back")?.click as () => void)();
    (item(t, "History", "Forward")?.click as () => void)();
    expect(d.onBack).toHaveBeenCalledTimes(1);
    expect(d.onForward).toHaveBeenCalledTimes(1);
  });

  it("assigns conventional accelerators", () => {
    const t = buildMenuTemplate(base, deps());
    expect(item(t, "Discovery", "Rescan")?.accelerator).toBe("CommandOrControl+R");
    expect(item(t, "Edit", "Find")?.accelerator).toBe("CommandOrControl+F");
    expect(item(t, "View", "Services")?.accelerator).toBe("CommandOrControl+1");
    expect(item(t, "View", "All")?.accelerator).toBe("CommandOrControl+4");
    expect(item(t, "History", "Back")?.accelerator).toBe("CommandOrControl+[");
    expect(item(t, "History", "Forward")?.accelerator).toBe("CommandOrControl+]");
  });

  it("puts the app menu first on macOS with the Local Network item", () => {
    const t = buildMenuTemplate(base, deps({ platform: "darwin" }));
    expect(t[0]?.label).toBe("Beacon");
    expect(item(t, "Beacon", "Open Local Network Settings…")).toBeDefined();
  });

  it("omits the app menu and the Local Network item off macOS", () => {
    const t = buildMenuTemplate(base, deps({ platform: "win32" }));
    expect(t[0]?.label).toBe("File");
    expect(t.some((m) => m.label === "Beacon")).toBe(false);
    const everyItem = t.flatMap((m) => (m.submenu ?? []) as MenuItemConstructorOptions[]);
    expect(everyItem.some((i) => i.label === "Open Local Network Settings…")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/main/appMenu.test.ts`
Expected: FAIL — cannot find module `./appMenu`.

- [ ] **Step 3: Implement `buildMenuTemplate`**

Create `src/main/appMenu.ts`:

```ts
import type { MenuItemConstructorOptions } from "electron";
import type { MenuCommand, ViewMode } from "../shared/ipc";

export interface MenuState {
  live: boolean;
  viewMode: ViewMode;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface MenuBuildDeps {
  platform: NodeJS.Platform;
  appName: string;
  onCommand: (cmd: MenuCommand) => void;
  onBack: () => void;
  onForward: () => void;
}

export function buildMenuTemplate(state: MenuState, deps: MenuBuildDeps): MenuItemConstructorOptions[] {
  const isMac = deps.platform === "darwin";
  const cmd = (c: MenuCommand): MenuItemConstructorOptions["click"] => () => deps.onCommand(c);

  const viewItem = (mode: ViewMode, label: string, num: string): MenuItemConstructorOptions => ({
    label,
    type: "radio",
    checked: state.viewMode === mode,
    accelerator: `CommandOrControl+${num}`,
    click: cmd(`view:${mode}`),
  });

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: deps.appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Open Local Network Settings…", click: cmd("openLocalNetworkSettings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      { label: "Export as JSON", click: cmd("export:json") },
      { label: "Export as CSV", click: cmd("export:csv") },
      { label: "Copy as Text", click: cmd("export:txt") },
      ...(isMac ? [] : [{ type: "separator" }, { role: "quit" }] as MenuItemConstructorOptions[]),
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? ([{ role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }] as MenuItemConstructorOptions[])
        : ([{ role: "delete" }, { type: "separator" }, { role: "selectAll" }] as MenuItemConstructorOptions[])),
      { type: "separator" },
      { label: "Find", accelerator: "CommandOrControl+F", click: cmd("focusSearch") },
    ],
  });

  template.push({
    label: "Discovery",
    submenu: [
      { label: "Rescan", accelerator: "CommandOrControl+R", click: cmd("rescan") },
      {
        label: state.live ? "Pause Discovery" : "Resume Discovery",
        accelerator: "CommandOrControl+.",
        click: cmd("toggleLive"),
      },
    ],
  });

  template.push({
    label: "View",
    submenu: [
      viewItem("service", "Services", "1"),
      viewItem("host", "Hosts", "2"),
      viewItem("ip", "IPs", "3"),
      viewItem("all", "All", "4"),
      { type: "separator" },
      { role: "togglefullscreen" },
      { role: "toggleDevTools" },
    ],
  });

  template.push({
    label: "History",
    submenu: [
      { label: "Back", accelerator: "CommandOrControl+[", enabled: state.canGoBack, click: () => deps.onBack() },
      { label: "Forward", accelerator: "CommandOrControl+]", enabled: state.canGoForward, click: () => deps.onForward() },
    ],
  });

  template.push({ role: "windowMenu" });

  return template;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/main/appMenu.test.ts`
Expected: PASS — 8 tests green.

- [ ] **Step 5: Typecheck, then commit**

```bash
pnpm typecheck && pnpm lint:fix
git add src/main/appMenu.ts src/main/appMenu.test.ts
git commit -m "feat(menu): pure buildMenuTemplate with live-state reflection"
```

---

## Task 6: `installAppMenu` shell + wire into main.ts

The imperative shell: builds/sets the menu, listens for `menu:state`, derives nav enablement from `webContents.navigationHistory`, routes Back/Forward, and sets the About panel. Wired into `createWindow`.

**Files:**
- Create: `src/main/installAppMenu.ts`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: `buildMenuTemplate`, `MenuState` (Task 5); `IPC.menuCommand`, `IPC.menuState`, `MenuCommand`, `MenuStatePayload` (Task 4).
- Produces: `installAppMenu(win: BrowserWindow): () => void` (returns dispose).

- [ ] **Step 1: Implement the shell**

Create `src/main/installAppMenu.ts`:

```ts
import { app, type BrowserWindow, ipcMain, Menu } from "electron";
import { IPC, type MenuCommand, type MenuStatePayload } from "../shared/ipc";
import { buildMenuTemplate, type MenuState } from "./appMenu";

// Builds the application menu and keeps it in sync. `live`/`viewMode` come from the
// renderer over IPC; nav enablement is read from the window's Chromium history stack.
// Rebuild-and-set on every change (cheap, and keeps buildMenuTemplate pure/testable).
export function installAppMenu(win: BrowserWindow): () => void {
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
  });

  const nav = () => win.webContents.navigationHistory;
  const state: MenuState = {
    live: true,
    viewMode: "service",
    canGoBack: nav().canGoBack(),
    canGoForward: nav().canGoForward(),
  };

  const refreshNav = (): void => {
    if (win.isDestroyed()) return;
    state.canGoBack = nav().canGoBack();
    state.canGoForward = nav().canGoForward();
    rebuild();
  };

  const rebuild = (): void => {
    const template = buildMenuTemplate(state, {
      platform: process.platform,
      appName: app.getName(),
      onCommand: (c: MenuCommand) => {
        if (!win.isDestroyed()) win.webContents.send(IPC.menuCommand, c);
      },
      onBack: () => {
        if (nav().canGoBack()) nav().goBack();
        refreshNav();
      },
      onForward: () => {
        if (nav().canGoForward()) nav().goForward();
        refreshNav();
      },
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  };

  const onMenuState = (_e: unknown, payload: MenuStatePayload): void => {
    state.live = payload.live;
    state.viewMode = payload.mode;
    rebuild();
  };
  ipcMain.on(IPC.menuState, onMenuState);

  const onNav = (): void => refreshNav();
  win.webContents.on("did-navigate-in-page", onNav);

  rebuild();

  return () => {
    ipcMain.removeListener(IPC.menuState, onMenuState);
    if (!win.isDestroyed()) win.webContents.removeListener("did-navigate-in-page", onNav);
  };
}
```

- [ ] **Step 2: Wire it into createWindow**

In `src/main/main.ts`, add the import:

```ts
import { installAppMenu } from "./installAppMenu";
```

In `createWindow`, after the `registerDiscoveryIpc(win);` line, add:

```ts
const disposeMenu = installAppMenu(win);
win.on("closed", () => disposeMenu());
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `pnpm start`. Expected: the menu bar shows Beacon · File · Edit · Discovery · View · History · Window. Rescan (⌘R) triggers a scan; Find (⌘F) focuses the search field; ⌘1–4 switch views; the View menu shows a checkmark on the active view; the Discovery item reads "Pause Discovery" when live and flips to "Resume" when paused (after Task 7 wires the renderer push — until then it stays on the default "Pause Discovery"). The App menu has a working About panel and "Open Local Network Settings…".

- [ ] **Step 5: Commit**

```bash
git add src/main/installAppMenu.ts src/main/main.ts
git commit -m "feat(menu): install the application menu and wire nav/about"
```

---

## Task 7: Renderer dispatcher + state push

Map incoming `menu:command`s to existing renderer commands, and push `{ live, mode }` to main whenever either changes.

**Files:**
- Create: `src/renderer/lib/menu.ts`
- Modify: `src/renderer/main.tsx`
- Test: `src/renderer/lib/menu.test.ts`

**Interfaces:**
- Consumes: `BeaconApi.onMenuCommand`/`sendMenuState` (Task 4); `rescan`/`toggleLive`/`exportAs` from `commands.ts`; the two stores.
- Produces: `dispatchMenuCommand(cmd, handlers)`, `installMenu(bridge?, handlers?): () => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/renderer/lib/menu.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { MenuCommand, MenuStatePayload } from "../../shared/ipc";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { dispatchMenuCommand, installMenu, type MenuBridge, type MenuHandlers } from "./menu";

function handlers(): MenuHandlers {
  return {
    rescan: vi.fn(),
    toggleLive: vi.fn(),
    exportAs: vi.fn(),
    setMode: vi.fn(),
    focusSearch: vi.fn(),
    openLocalNetworkSettings: vi.fn(),
  };
}

describe("dispatchMenuCommand", () => {
  it.each([
    ["rescan", "rescan"],
    ["toggleLive", "toggleLive"],
    ["focusSearch", "focusSearch"],
    ["openLocalNetworkSettings", "openLocalNetworkSettings"],
  ] as const)("routes %s to its handler", (cmd, key) => {
    const h = handlers();
    dispatchMenuCommand(cmd as MenuCommand, h);
    expect(h[key]).toHaveBeenCalledTimes(1);
  });

  it("routes view:* to setMode with the parsed mode", () => {
    const h = handlers();
    dispatchMenuCommand("view:host", h);
    expect(h.setMode).toHaveBeenCalledWith("host");
  });

  it("routes export:* to exportAs with the kind", () => {
    const h = handlers();
    dispatchMenuCommand("export:csv", h);
    expect(h.exportAs).toHaveBeenCalledWith("csv");
  });
});

describe("installMenu", () => {
  function fakeBridge() {
    const sent: MenuStatePayload[] = [];
    let cmd: ((c: MenuCommand) => void) | undefined;
    const bridge: MenuBridge = {
      onMenuCommand: (l) => {
        cmd = l;
        return () => {
          cmd = undefined;
        };
      },
      sendMenuState: (s) => {
        sent.push(s);
      },
    };
    return { bridge, sent, emit: (c: MenuCommand) => cmd?.(c) };
  }

  it("pushes initial state, pushes on live/mode change, and dedupes unrelated changes", () => {
    const { bridge, sent } = fakeBridge();
    useSettingsStore.getState().setMode("service");
    useDiscoveryStore.getState().applyStatus({ live: false, scanning: false });

    const teardown = installMenu(bridge, handlers());
    expect(sent.at(-1)).toEqual({ live: false, mode: "service" });
    const afterInit = sent.length;

    useSettingsStore.getState().setMode("host");
    expect(sent.at(-1)).toEqual({ live: false, mode: "host" });

    useDiscoveryStore.getState().applyStatus({ live: true, scanning: false });
    expect(sent.at(-1)).toEqual({ live: true, mode: "host" });

    const before = sent.length;
    useDiscoveryStore.getState().setQuery("printer"); // no live/mode change
    expect(sent.length).toBe(before);

    expect(afterInit).toBe(1);
    teardown();
  });

  it("dispatches commands received over the bridge", () => {
    const { bridge, emit } = fakeBridge();
    const h = handlers();
    const teardown = installMenu(bridge, h);
    emit("rescan");
    expect(h.rescan).toHaveBeenCalledTimes(1);
    teardown();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/renderer/lib/menu.test.ts`
Expected: FAIL — cannot find module `./menu`.

- [ ] **Step 3: Implement the dispatcher and installer**

Create `src/renderer/lib/menu.ts`:

```ts
import type { MenuCommand, MenuStatePayload, ViewMode } from "../../shared/ipc";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { exportAs, rescan, toggleLive } from "./commands";

export interface MenuBridge {
  onMenuCommand: (listener: (cmd: MenuCommand) => void) => () => void;
  sendMenuState: (state: MenuStatePayload) => void;
}

export interface MenuHandlers {
  rescan: () => unknown;
  toggleLive: () => unknown;
  exportAs: (kind: "json" | "csv" | "txt") => unknown;
  setMode: (mode: ViewMode) => void;
  focusSearch: () => void;
  openLocalNetworkSettings: () => unknown;
}

const VIEW_PREFIX = "view:";

export function dispatchMenuCommand(cmd: MenuCommand, h: MenuHandlers): void {
  if (cmd.startsWith(VIEW_PREFIX)) {
    h.setMode(cmd.slice(VIEW_PREFIX.length) as ViewMode);
    return;
  }
  switch (cmd) {
    case "rescan":
      h.rescan();
      break;
    case "toggleLive":
      h.toggleLive();
      break;
    case "focusSearch":
      h.focusSearch();
      break;
    case "export:json":
      h.exportAs("json");
      break;
    case "export:csv":
      h.exportAs("csv");
      break;
    case "export:txt":
      h.exportAs("txt");
      break;
    case "openLocalNetworkSettings":
      h.openLocalNetworkSettings();
      break;
  }
}

function defaultHandlers(): MenuHandlers {
  return {
    rescan,
    toggleLive,
    exportAs,
    setMode: (mode) => useSettingsStore.getState().setMode(mode),
    focusSearch: () => document.getElementById("beacon-search")?.focus(),
    openLocalNetworkSettings: () => window.beacon.openLocalNetworkSettings(),
  };
}

export function installMenu(bridge: MenuBridge = window.beacon, handlers: MenuHandlers = defaultHandlers()): () => void {
  const unsubCmd = bridge.onMenuCommand((cmd) => dispatchMenuCommand(cmd, handlers));

  let lastSent = "";
  const push = (): void => {
    const live = useDiscoveryStore.getState().status.live;
    const mode = useSettingsStore.getState().mode;
    const key = `${live}:${mode}`;
    if (key === lastSent) return;
    lastSent = key;
    bridge.sendMenuState({ live, mode });
  };

  push();
  const unsubDisc = useDiscoveryStore.subscribe(push);
  const unsubSet = useSettingsStore.subscribe(push);

  return () => {
    unsubCmd();
    unsubDisc();
    unsubSet();
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/renderer/lib/menu.test.ts`
Expected: PASS — all dispatch + install tests green.

- [ ] **Step 5: Wire installMenu into the renderer bootstrap**

In `src/renderer/main.tsx`, add the import next to `installKeyboard`:

```ts
import { installMenu } from "./lib/menu";
```

In `Root`'s `useEffect`, install it alongside the keyboard handler and tear it down:

```ts
const removeKeys = installKeyboard();
const removeMenu = installMenu();
return () => {
  clearInterval(clock);
  removeKeys();
  removeMenu();
};
```

- [ ] **Step 6: Typecheck, lint, and run the full suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: green.

- [ ] **Step 7: Manual verification**

Run: `pnpm start`. Expected: the Discovery menu label now tracks live state (Pause⇄Resume); selecting a view from the menu or pressing ⌘1–4 moves the checkmark; Find/Export/Rescan from the menu behave exactly like their in-app equivalents (toasts appear). If the sibling navigation feature is present, Back/Forward enable and walk history; otherwise they stay disabled.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/lib/menu.ts src/renderer/lib/menu.test.ts src/renderer/main.tsx
git commit -m "feat(menu): renderer command dispatch + live state push"
```

---

## Verification summary

After all tasks: `pnpm typecheck && pnpm lint && pnpm test` is green, and a manual `pnpm start` confirms the menu (commands, accelerators, live labels, view checkmark) and the wake-restart behavior. New logic is unit-tested (`DiscoveryManager.restartSource`, `installPowerEvents`, `buildMenuTemplate`, `dispatchMenuCommand`/`installMenu`); imperative shells (`installAppMenu`, `main.ts`, `registerDiscoveryIpc` wiring) are verified by typecheck + manual run, matching the codebase's testing conventions.
