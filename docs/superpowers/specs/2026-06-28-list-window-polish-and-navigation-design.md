# List/Window Polish + SPA Navigation — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)

Six independent UI/UX changes to the Beacon renderer and Electron main process. Each
section below is self-contained and can be implemented and verified on its own.

---

## 1. IPv6 chip overflow (CSS only)

**Problem.** In the Services tree, child rows render the host's primary IP as an
accent chip (`primaryIp` → `chip` in `buildServiceTree`, [selectors.ts](../../../src/renderer/lib/selectors.ts)).
The chip CSS uses `white-space: nowrap` with no shrink or clip, so a long IPv6 value
(e.g. `fdc9:5672:bcfa:4ac9:1029:28bd:732b:6b32`) overflows the 384px pane and is
visually cut off at the pane edge. The same chip appears in the All view (`FlatRow`).

**Fix.** Make the IP chips shrink-and-ellipsize instead of clipping. Apply to:

- `.accentChip` and `.grayChip` in [Rows.module.css](../../../src/renderer/components/rows/Rows.module.css)
- `.chip` in [FlatRow.module.css](../../../src/renderer/components/rows/FlatRow.module.css)

```css
min-width: 0;
max-width: 50%;
overflow: hidden;
text-overflow: ellipsis;
flex-shrink: 1;
```

The title/name column already has `flex: 1; min-width: 0` and its own ellipsis, so it
keeps priority; the chip caps at half the row width and ellipsizes at the end
(`fdc9:5672:bcfa:…`). Because the chip width is relative, it adapts as the pane is
resized (section 3).

**Out of scope.** No truncation logic in JS; this is purely presentational.

**Verification.** Run the app; confirm an IPv6-only host (e.g. Television) shows an
ellipsized chip that never clips past the pane edge, in both Services and All views,
and that it shows more characters as the pane is widened.

---

## 2. Duplicate host name → show IP (selectors only)

**Problem.** In the Hosts view, each host group row shows its name twice: the
white title (`displayName`) and a muted-gray subtitle (`hostname`). For `.local`
hosts these are identical, so the subtitle is pure noise.

**Fix.** In `buildHostTree` ([selectors.ts](../../../src/renderer/lib/selectors.ts)):

- `subtitle`: change from `h?.hostname` to `primaryIp(h) ?? undefined` — the first
  known IP (IPv4 preferred, per `primaryIp`'s family ordering). Hosts with no known
  address render no subtitle.
- `chip`: change from `primaryIp(h)` to `null` — otherwise the IP would appear twice
  (subtitle + chip).

The count pill (`count` = number of services on the host) is unchanged. The subtitle
keeps its existing `.subtitle` styling (muted gray); no styling change.

**Verification (TDD).** Add/extend `selectors.test.ts` cases for `buildHostTree`:
- A host with addresses → `subtitle === primaryIp(host)`, `chip === null`.
- A host with no addresses → `subtitle === undefined`, `chip === null`.
- `count` still equals the number of instances on the host.

---

## 3. Resizable, persisted list pane

**Problem.** The list pane is a fixed `flex: 0 0 384px`
([tokens.css](../../../src/renderer/styles/tokens.css)) with no way to resize.

**Design.**

- **State.** Add to [settingsStore.ts](../../../src/renderer/store/settingsStore.ts)
  (already `persist`-backed → `localStorage` key `beacon.settings`):
  - `listPaneWidth: number` (default `384`)
  - `setListPaneWidth(px: number)` → stores `clampPaneWidth(px)`
  - **No `version` bump.** zustand `persist` shallow-merges persisted state over the
    initial state, so an absent `listPaneWidth` simply falls back to its default while
    existing settings rehydrate normally. (Bumping `version` without a `migrate`
    function would *discard* the persisted settings — do not do that here.)
- **Clamp helper.** Pure function, its own module (e.g. `src/renderer/lib/paneWidth.ts`)
  for unit testing:
  ```ts
  export const PANE_MIN = 260;
  export const PANE_MAX = 640;
  export function clampPaneWidth(px: number): number; // clamp to [MIN, MAX], floor, NaN→default
  ```
- **Layout.** Change `.bcn-list-pane` to `flex: 0 0 auto` and drive width from the
  store via an inline `style={{ width }}` in [App.tsx](../../../src/renderer/App.tsx).
- **Divider.** New `src/renderer/components/PaneDivider.tsx`: a 6px-wide element with
  `cursor: col-resize`, placed between the list and detail `<section>`s. On
  `pointerdown` it calls `setPointerCapture` and records the body's left edge; on
  `pointermove` it computes `clampPaneWidth(clientX − bodyLeft)` and calls
  `setListPaneWidth` live; `pointerup`/`lostpointercapture` releases. A hover/active
  highlight gives feedback. The handle is a `bcn-no-drag` region so it never triggers
  the window drag.

**Data flow.** Divider drag → `setListPaneWidth` (clamped) → store update → inline
width re-render + `persist` writes to `localStorage`. Restored automatically on next
launch by `persist` rehydration.

**Verification.** Unit test `clampPaneWidth` (below/in/above range, NaN). Run the app:
drag the divider, confirm the pane resizes within bounds and the width survives a
reload.

---

## 4. Persisted window bounds (main process)

**Problem.** `createWindow` hardcodes `width: 1100, height: 720`
([main.ts](../../../src/main/main.ts)); size/position are lost on quit.

**Design.** New module `src/main/windowState.ts`, no new runtime dependency (avoids
the packaging dep-closure issue documented in project memory). It persists window
geometry to a JSON file and is structured for unit testing via injected I/O.

- **Shape:** `interface WindowState { width: number; height: number; x?: number; y?: number; isMaximized: boolean }`
- **Storage:** `window-state.json` in `app.getPath('userData')`.
- **API:**
  - `loadWindowState(opts): WindowState` — read+parse the file; on missing/corrupt
    file or off-screen bounds, fall back to defaults (`1100×720`, centered,
    `isMaximized: false`). Validates the saved rect intersects a visible display
    (via `screen.getDisplayMatching`); if not, drops `x/y` so Electron re-centers.
  - `manageWindow(win, opts): void` — apply maximize if saved; attach debounced
    (~300ms) `resize`/`move` listeners and a `close` listener that capture
    `getBounds()` + `isMaximized()` and write the file. While maximized, persist the
    *normal* bounds (from `getNormalBounds()`) plus `isMaximized: true` so un-maximize
    restores correctly.
  - I/O (read/write/`getPath`/`screen`) injected through `opts` (defaults wire the
    real Electron + `node:fs`), so tests run without Electron.
- **Wiring in `main.ts`:** call `loadWindowState()` to seed the `BrowserWindow`
  constructor (`width/height/x/y`), then `manageWindow(win)` after creation.

**Error handling.** All file reads/writes are wrapped; any failure logs and falls back
to defaults (never throws into `createWindow`). Corrupt JSON → defaults.

**Verification (TDD).** Unit test `loadWindowState` with a fake fs:
- missing file → defaults
- corrupt JSON → defaults
- valid on-screen bounds → returned verbatim
- off-screen bounds → `x/y` dropped, size kept

Then run the app: resize/move/maximize, quit, relaunch, confirm restoration.

---

## 5. Webpage-style back/forward navigation

**Problem.** No way to navigate back/forward through previously viewed
selections/views, the way a browser would.

**Concept.** A "location" is the app's navigable view state:

```ts
interface NavLocation { mode: Lens; selection: Selection | null }
```

`mode` lives in `settingsStore`; `selection` lives in `discoveryStore`. Search query
is **not** part of a location (excluded by design — it's a transient filter).

**Renderer — `src/renderer/lib/navigation.ts`:**

- `currentLocation()` reads `{ mode, selection }` from the two stores.
- `installNavigation()` (called once from `main.tsx`, like `installKeyboard`):
  1. `history.replaceState(currentLocation(), "")` to seed the initial entry.
  2. Subscribe to `settingsStore` (`mode`) and `discoveryStore` (`selection`). When
     either changes **and** the change was user-driven (not a popstate apply), compare
     against the last pushed location and `history.pushState(next, "")`.
  3. `window.addEventListener("popstate", e)` → take `e.state` as the location and
     apply it: set the `applying` guard, write `mode` (`setMode`) and `selection`
     (the matching `selectX`/clear) into the stores, clear the guard. The guard makes
     the subscription skip the push that the store writes would otherwise trigger.
  4. Return a teardown that removes the listener + unsubscribes.
- Applying a `selection` reuses existing store actions: `selectInst`/`selectSvc`/
  `selectHost`/`selectIp` by `kind`, or a clear when `selection` is `null`. Because
  `selectSvc`/`selectHost` also mutate `expanded`, applying a location naturally
  re-expands the relevant group.
- A single tracked "current location" baseline is updated on **both** push and apply,
  so that after a popstate apply the next user-driven change still compares against the
  just-applied location (and an apply never leaves a stale baseline that fires a
  spurious push).

The push/apply/guard logic is written so the History object and stores can be
injected/faked for unit tests.

**Keyboard — [keyboard.ts](../../../src/renderer/lib/keyboard.ts):** before the
existing `if (e.metaKey || e.ctrlKey || e.altKey) return;` guard, add:
- Cmd/Ctrl+`[` or Cmd/Ctrl+`ArrowLeft` → `history.back()`
- Cmd/Ctrl+`]` or Cmd/Ctrl+`ArrowRight` → `history.forward()`

(These intentionally run only when not typing in an input — the existing `typing`
early-return already covers that.)

**Mouse + trackpad — main process:** the renderer can't see OS navigation gestures, so
wire them in `main.ts` on the window:
- `win.on("app-command", (e, cmd) => …)` for `browser-backward` / `browser-forward`
  (Windows/Linux mouse side buttons).
- `win.on("swipe", (e, dir) => …)` for the macOS 3-finger trackpad gesture (`left` →
  back, `right` → forward).
- Both call `win.webContents.navigationHistory.goBack()` / `.goForward()` (guarded by
  `canGoBack()` / `canGoForward()`), which navigates the same Chromium history stack
  and fires the renderer's `popstate`. macOS 2-finger swipe and mouse side-buttons are
  handled natively by Chromium against the same stack, so they work without extra code.

**Why this converges.** `pushState` entries, `history.back/forward()`, and
`navigationHistory.goBack/goForward()` all operate on one Chromium history stack, so
every trigger funnels through a single `popstate` → `applyLocation` path. No second
source of truth.

**Edge cases.**
- Going back past the first SPA entry lands on the initial `index.html` entry;
  `navigationHistory.canGoBack()` is false there, so `goBack()` is a no-op and the app
  is never navigated away from itself.
- On reload, Chromium preserves the history entries (and their `state` objects); the
  renderer rebuilds the stores from the re-sent snapshot (existing behavior) and
  `replaceState`s the current location on install.

**Verification (TDD).** Unit test `navigation.ts` with a fake history + fake stores:
- user-driven `mode`/`selection` change → exactly one `pushState` with the right
  location
- `popstate` → stores updated to the event's location, and **no** re-push (guard works)
- search-query change → no `pushState`
- duplicate location (no actual change) → no `pushState`

Then run the app: change selections/views, use Cmd+[ / Cmd+] and the trackpad to walk
the history back and forward.

**Decision on record.** No toolbar back/forward buttons — navigation responds only to
keyboard, mouse side-buttons, and trackpad. There is intentionally no visible
back/forward affordance.

---

## 6. Outline the view SegmentedControl (pure Radix)

**Problem.** The view switcher (Services/Hosts/IPs/All) reads flat against the toolbar
compared with the other top-bar controls.

**Finding.** Radix's `SegmentedControl` provides **no** outer border in any variant;
its `surface` (default) and `classic` variants only style the *active segment's*
indicator (segmented-control.css). A full outer outline like the search field's would
require custom CSS, which we are not adding.

**Fix (decided: pure Radix).** In [Toolbar.tsx](../../../src/renderer/components/Toolbar.tsx),
set `variant="classic"` on `SegmentedControl.Root` so the selected segment gets a more
raised, defined look (`--shadow-2`). Remove the custom `.segmented` class from the
element and delete the `.segmented` rule from
[Toolbar.module.css](../../../src/renderer/components/Toolbar.module.css); the
toolbar's existing `gap: 8px` handles spacing. Keep the `bcn-no-drag` class.

There is intentionally no outer ring around the whole control.

**Verification.** Run the app; confirm the selected view segment looks raised/defined
and spacing is unchanged.

---

## Testing summary

| Item | Logic tests (TDD) | Manual (run app) |
|------|-------------------|------------------|
| 1 IPv6 chip | — | ellipsis, no clip, adapts to pane width |
| 2 Host name → IP | `buildHostTree` subtitle/chip/count | Hosts view shows IP, name once |
| 3 Resizable pane | `clampPaneWidth` | drag + persists across reload |
| 4 Window bounds | `loadWindowState` (fake fs) | resize/move/maximize survives relaunch |
| 5 Navigation | `navigation.ts` push/apply/guard | Cmd+[ / ], trackpad, mouse buttons |
| 6 Segmented | — | selected segment raised, spacing intact |

## File inventory

**New:**
- `src/renderer/lib/paneWidth.ts` (+ test)
- `src/renderer/components/PaneDivider.tsx` (+ module.css)
- `src/main/windowState.ts` (+ test)
- `src/renderer/lib/navigation.ts` (+ test)

**Modified:**
- `src/renderer/components/rows/Rows.module.css` (chip ellipsis)
- `src/renderer/components/rows/FlatRow.module.css` (chip ellipsis)
- `src/renderer/lib/selectors.ts` (`buildHostTree` subtitle/chip) + test
- `src/renderer/store/settingsStore.ts` (`listPaneWidth`, no version bump) + test
- `src/renderer/App.tsx` (inline pane width + divider)
- `src/renderer/styles/tokens.css` (`.bcn-list-pane` flex)
- `src/main/main.ts` (window state wiring + nav gesture handlers)
- `src/renderer/main.tsx` (`installNavigation`)
- `src/renderer/lib/keyboard.ts` (back/forward shortcuts) + test
- `src/renderer/components/Toolbar.tsx` (`variant="classic"`, drop `.segmented`)
- `src/renderer/components/Toolbar.module.css` (remove `.segmented`)
