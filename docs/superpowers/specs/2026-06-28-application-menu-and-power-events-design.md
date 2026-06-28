# Application Menu + powerMonitor Wake Restart — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)

Two native-Electron features for Beacon, each self-contained and independently
verifiable:

1. **A real application menu** — Beacon currently runs on Electron's bare default
   menu (`Menu.setApplicationMenu` is never called). This adds a custom menu that
   surfaces the app's commands with conventional ⌘-accelerators and reflects live
   state (Pause⇄Resume, active-view checkmark, Back/Forward enablement).
2. **powerMonitor wake handling** — on wake from sleep the discovery sockets are
   often bound to a network interface that no longer exists, so the list goes stale.
   On `resume`, when discovery is live, fully restart the discovery source so the
   sockets rebind to the current interface.

The two share no code and can be built/verified separately. The IPC and renderer
plumbing below is for the menu only; powerMonitor is entirely main-process.

---

## Decisions on record

These were settled during brainstorming and drive the design:

- **Menu reflects live state** (not static): Pause⇄Resume label flip, a radio
  checkmark on the active View, and Back/Forward enabled/disabled. This requires the
  menu to learn the current view mode and live status.
- **⌘-accelerators in the menu, existing bare-key shortcuts kept** in the renderer's
  input-aware handler ([keyboard.ts](../../../src/renderer/lib/keyboard.ts)). Native
  menu accelerators fire even while typing in a field; the bare keys (r, p/Space, 1–4,
  /) correctly ignore typing and stay as the fast path. No consolidation, no footgun.
- **Wake = full socket restart on `resume` only**, when live, after a settle delay;
  no-op when paused; ignores screen lock/unlock.
- **History menu items are in scope.** The earlier navigation spec said "no *toolbar*
  back/forward buttons"; menu items are a different, chrome-less affordance and were
  endorsed when the live-state menu option was approved.

---

## Part 1 — Application Menu

### 1.1 Architecture: hybrid command routing

The menu lives in the main process; most commands act on renderer state (view mode,
search focus, export, live toggle). Clicks route in one of two ways:

- **Renderer-meaningful commands** → main sends a typed `menu:command` over a new
  channel; a renderer dispatcher maps each to the **existing** functions in
  [commands.ts](../../../src/renderer/lib/commands.ts) (so toasts and all behavior are
  reused verbatim). No new command logic is introduced in the renderer.
- **Back / Forward** → executed in main against `win.webContents.navigationHistory`
  (`goBack()`/`goForward()`), the same Chromium history stack the navigation feature
  funnels through. These are the only menu actions that run in main.

Rejected alternatives: routing *everything* through main (impossible — view/search/
export are renderer-only); routing *everything* through the renderer (Back/Forward
genuinely belong on the main-side history stack).

### 1.2 Menu structure

macOS layout (Windows/Linux differences below):

```
Beacon (app menu)
  About Beacon
  ──
  Open Local Network Settings…        (macOS only)
  ──
  Services / Hide / Hide Others / Show All
  ──
  Quit Beacon                         ⌘Q

Edit
  Undo / Redo
  ──
  Cut / Copy / Paste / Select All
  ──
  Find                                ⌘F      → focusSearch

Discovery
  Rescan                              ⌘R      → rescan
  Pause Discovery                     ⌘.      → toggleLive   (label flips to "Resume Discovery")
  ──
  Open Local Network Settings…                → openLocalNetworkSettings   (non-mac only; mac has it in app menu)

View
  ✓ Services                          ⌘1      → view:service   (radio; checkmark on active)
    Hosts                             ⌘2      → view:host
    IPs                               ⌘3      → view:ip
    All                               ⌘4      → view:all
  ──
  Toggle Full Screen
  Toggle Developer Tools

History
  Back                                ⌘[      → main goBack    (disabled when !canGoBack)
  Forward                             ⌘]      → main goForward  (disabled when !canGoForward)

File (Export)
  Export as JSON                              → export:json
  Export as CSV                               → export:csv
  Copy as Text                                → export:txt

Window
  (standard windowMenu role)
```

- **Menu-bar order** (left to right): app menu (macOS only) · File · Edit · Discovery ·
  View · History · Window. On Windows/Linux the leading app menu is absent and File
  leads.
- **Edit** and **Window** use built-in roles, except Edit is built explicitly so a
  **Find** item (⌘F) can be appended. ⌘F joins the existing ⌘K and `/` search-focus
  shortcuts; all three work.
- **View** combines the app's view switcher (radio group, checkmark tracks
  `settingsStore.mode`) with `togglefullscreen` and `toggleDevTools` roles.
- **⌘R** is bound to Rescan, intentionally overriding Chromium's default reload.
- **Accelerators** use `'CommandOrControl'` so they map to Ctrl on Windows/Linux;
  brackets are `'CommandOrControl+['` / `']'`.
- **`app.setAboutPanelOptions`** is set at install time (app name, version via
  `app.getVersion()`, copyright/credits) so the About item shows real metadata.

**Cross-platform.** On Windows/Linux there is no app menu, so `Quit` lives in File and
`Open Local Network Settings…` (a macOS-only deep link) is hidden via `visible:
process.platform === 'darwin'`. `buildMenuTemplate` takes the platform as a dep and
emits the right shape.

### 1.3 Dynamic state

A **pure** `buildMenuTemplate(state, deps)` returns the Electron menu template array;
the controller rebuilds it and calls `Menu.setApplicationMenu` whenever state changes.
Rebuild-and-reset is simpler and more testable than mutating individual `MenuItem`s and
is cheap.

```ts
interface MenuState { live: boolean; viewMode: Lens; canGoBack: boolean; canGoForward: boolean }
interface MenuDeps {
  platform: NodeJS.Platform;
  onCommand: (cmd: MenuCommand) => void;   // → win.webContents.send(IPC.menuCommand, cmd)
  onBack: () => void;                      // → navigationHistory.goBack()
  onForward: () => void;                   // → navigationHistory.goForward()
  appName: string;
}
```

Where each state field originates — this keeps the menu module decoupled from the
`DiscoveryManager`:

- **`canGoBack` / `canGoForward`** — read in main from
  `win.webContents.navigationHistory.canGoBack()/canGoForward()`. Refreshed on the
  `did-navigate-in-page` webContents event (SPA `pushState`/`popstate` fire it) and
  immediately after each `goBack()`/`goForward()`. The renderer is **not** involved.
- **`live` + `viewMode`** — renderer-owned UI truth. The renderer pushes
  `{ live, mode }` over the new `menu:state` channel whenever either store changes, and
  once on mount. Until the first push, the menu shows defaults (`live: true`,
  `viewMode: 'service'`) and converges on mount.

### 1.4 IPC surface (new)

Added to [ipc.ts](../../../src/shared/ipc.ts):

- `menuCommand: "menu:command"` — **main → renderer**, payload `MenuCommand`.
- `menuState: "menu:state"` — **renderer → main**, one-way (`ipcRenderer.send` /
  `ipcMain.on`), payload `{ live: boolean; mode: Lens }`.

```ts
type MenuCommand =
  | "rescan" | "toggleLive"
  | "view:service" | "view:host" | "view:ip" | "view:all"
  | "focusSearch"
  | "export:json" | "export:csv" | "export:txt"
  | "openLocalNetworkSettings";
```

[beacon-api.ts](../../../src/shared/beacon-api.ts) gains:
`onMenuCommand(listener: (cmd: MenuCommand) => void): Unsubscribe` and
`sendMenuState(state: { live: boolean; mode: Lens }): void`.
[preload.ts](../../../src/preload/preload.ts) implements `onMenuCommand` via the existing
`subscribe` helper and `sendMenuState` via `ipcRenderer.send`; the `.d.ts` mirrors the
types.

### 1.5 Renderer wiring

New `src/renderer/lib/menu.ts`, `installMenu()` (mirrors `installKeyboard` /
`installNavigation`, called once from [main.tsx](../../../src/renderer/main.tsx)):

- **State push.** Subscribe to `discoveryStore` (`status.live`) and `settingsStore`
  (`mode`); on change (and once immediately) call `window.beacon.sendMenuState({ live,
  mode })`. De-dupe against the last sent value so unrelated store updates don't spam.
- **Command dispatch.** `window.beacon.onMenuCommand(cmd => …)` routes to existing
  code only:
  | command | action |
  |---|---|
  | `rescan` | `rescan()` |
  | `toggleLive` | `toggleLive()` |
  | `view:*` | `useSettingsStore.getState().setMode(...)` |
  | `focusSearch` | `document.getElementById("beacon-search")?.focus()` |
  | `export:json\|csv\|txt` | `exportAs(kind)` |
  | `openLocalNetworkSettings` | `window.beacon.openLocalNetworkSettings()` |
- Returns a teardown that unsubscribes both store subscriptions and the channel.

### 1.6 Main wiring & lifecycle

New `src/main/appMenu.ts`:

- `buildMenuTemplate(state, deps)` — pure (above).
- `installAppMenu(win)` — calls `setAboutPanelOptions`, builds initial state
  (`live: true`, `viewMode: 'service'`, nav from `navigationHistory`), sets the menu,
  and wires:
  - `ipcMain.on(IPC.menuState, (_e, s) => update({ live: s.live, viewMode: s.mode }))`
  - `win.webContents.on('did-navigate-in-page', refreshNav)`
  - `onBack`/`onForward` deps call `navigationHistory.goBack/goForward()` (guarded by
    `canGoBack/canGoForward`) then `refreshNav()`.
  - `onCommand` dep calls `win.webContents.send(IPC.menuCommand, cmd)`.
  - Returns a controller with `dispose()` that removes the `ipcMain.on` and webContents
    listeners.
- Called from `createWindow` in [main.ts](../../../src/main/main.ts); `dispose()` runs in
  `win.on("closed")`. Re-running `createWindow` on `activate` re-installs cleanly. Same
  per-window pattern (and same global-handler caveat) already documented in
  registerDiscoveryIpc.

### 1.7 Menu testing

`src/main/appMenu.test.ts` exercises `buildMenuTemplate` only (no Electron):

- Labels & accelerators present and correct per platform (mac vs non-mac shape;
  `Open Local Network Settings…` placement/visibility).
- `live: true` → "Pause Discovery"; `live: false` → "Resume Discovery".
- View radio: exactly the item matching `viewMode` is `checked`.
- Back/Forward `enabled` track `canGoBack`/`canGoForward`.
- Clicking each item invokes the right dep: `view:host` click → `onCommand("view:host")`;
  Back click → `onBack()`; etc.

---

## Part 2 — powerMonitor Wake Restart

### 2.1 Behavior

On `powerMonitor` `'resume'`:

- If discovery is **paused**, do nothing.
- If **live**, schedule a restart after a **settle delay (~2000 ms)**. The delay lets
  the OS bring the network interface back up before we rebind — restarting instantly
  often rebinds before Wi-Fi reassociates. A second `'resume'` within the window resets
  the timer (debounce). `live` is re-checked when the timer fires (the user may have
  paused in the interim).

Only `'resume'` is handled. `'unlock-screen'`/`'lock-screen'`/`'suspend'` are ignored —
routine screen unlocks rarely change the network and don't justify a socket restart.

### 2.2 `DiscoveryManager.restartSource()`

New method on [DiscoveryManager.ts](../../../src/main/discovery/DiscoveryManager.ts):

```ts
restartSource(): void {
  if (!this.live) return;
  this.source.stop();   // destroy stale udp4/udp6 engines/sockets
  this.source.start();  // recreate; udp6 recomputes link-local interface, sockets rebind
  this.emitStatus(true); // brief "scanning" blip, like rescan()
  if (this.scanTimer) clearTimeout(this.scanTimer);
  this.scanTimer = setTimeout(() => this.emitStatus(false), this.scanWindowMs);
}
```

The manager's subscription to the source is preserved across `stop()/start()` because
`BonjourSource` keeps its `listeners` Set independent of its `records`
([BonjourSource.ts](../../../src/main/discovery/sources/BonjourSource.ts)); `start()`
re-attaches browser events that emit to those same listeners. The
[`DiscoveryStore`](../../../src/main/discovery/store.ts) is **not** reset, so the visible
list survives; entries that don't re-announce prune via the existing tick/grace timer.

### 2.3 `installPowerEvents`

New `src/main/powerEvents.ts`:

```ts
interface PowerEventsDeps {
  powerMonitor: { on(ev: string, cb: () => void): void; off(ev: string, cb: () => void): void };
  isLive: () => boolean;
  restart: () => void;
  settleMs?: number;                 // default 2000
  setTimer?: typeof setTimeout;      // injectable for tests
  clearTimer?: typeof clearTimeout;
}
export function installPowerEvents(deps: PowerEventsDeps): () => void; // returns teardown
```

- Subscribes to `'resume'`; on fire, if `isLive()`, (re)schedule the restart via
  `setTimer`. On fire of the timer, re-check `isLive()` then call `restart()`.
- Teardown: `powerMonitor.off('resume', …)` and clear any pending timer.

Wired in [registerDiscoveryIpc.ts](../../../src/main/ipc/registerDiscoveryIpc.ts), which
already owns the manager and its lifecycle:

```ts
const teardownPower = installPowerEvents({
  powerMonitor,
  isLive: () => manager.getStatus().live,
  restart: () => manager.restartSource(),
});
```

and `teardownPower()` is added to the existing `win.on("closed")` cleanup. `powerMonitor`
is only valid after `app` is ready; `registerDiscoveryIpc` runs from `createWindow`
inside `app.whenReady()`, so this is safe.

### 2.4 powerMonitor testing

`src/main/powerEvents.test.ts` uses a fake `powerMonitor` (records handlers, lets the
test emit `'resume'`) and a fake clock:

- live + resume → `restart()` fires once after `settleMs`.
- paused + resume → never restarts.
- two resumes within the window → restart fires once (debounced).
- live → user pauses before timer fires → no restart (re-check at fire time).
- teardown before timer fires → no restart, handler removed.

`DiscoveryManager.test.ts` gains a `restartSource` case (fake source): no-op when paused;
when live, calls `source.stop()` then `source.start()` and emits a scanning status blip.

---

## Testing summary

| Area | Logic tests (TDD) | Manual (run app) |
|------|-------------------|------------------|
| Menu template | `buildMenuTemplate` labels/accel/checkmarks/enablement/click routing | menu items + ⌘-accelerators work; labels/checkmarks track state |
| Menu renderer | `menu.ts` command dispatch + state push (fake API + stores) | Pause⇄Resume, view checkmark, Find/Export from menu |
| Manager restart | `DiscoveryManager.restartSource` (fake source) | — |
| powerMonitor | `powerEvents` (fake monitor + clock) | sleep → change Wi-Fi → wake → list repopulates |

## File inventory

**New:**
- `src/main/appMenu.ts` (+ `appMenu.test.ts`)
- `src/main/powerEvents.ts` (+ `powerEvents.test.ts`)
- `src/renderer/lib/menu.ts` (+ `menu.test.ts`)

**Modified:**
- `src/shared/ipc.ts` (`menuCommand`, `menuState` channels; `MenuCommand` type)
- `src/shared/beacon-api.ts` (`onMenuCommand`, `sendMenuState`)
- `src/preload/preload.ts` (+ `src/preload/beacon-api.d.ts`)
- `src/main/main.ts` (`installAppMenu(win)` + dispose on closed)
- `src/main/ipc/registerDiscoveryIpc.ts` (`installPowerEvents` + teardown)
- `src/main/discovery/DiscoveryManager.ts` (`restartSource()`)
- `src/renderer/main.tsx` (`installMenu()`)

## Out of scope

Tray/menu-bar presence, notifications, native save dialog, dock badge, nativeTheme
bridge, row context menus, auto-updater — all noted as future candidates, none included
here.
