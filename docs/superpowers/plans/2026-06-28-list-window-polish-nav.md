# List/Window Polish + SPA Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six independent Beacon UI/UX improvements — IPv6 chip ellipsis, host name→IP subtitle, a resizable+persisted list pane, persisted window bounds, webpage-style back/forward navigation, and a `classic` SegmentedControl.

**Architecture:** Renderer changes use React + Zustand (`persist` for settings) and CSS Modules; the main process adds a dependency-free `windowState` module and wires OS navigation gestures to Electron's `webContents.navigationHistory`. SPA navigation is built on the browser History API in the renderer, so keyboard, mouse, and trackpad triggers all converge on a single `popstate` → apply path.

**Tech Stack:** Electron 42, React 18, Zustand, Radix Themes, CSS Modules, Vitest (projects: `node` env for `src/main`/`src/shared`, `happy-dom` for `src/renderer`), Biome.

## Global Constraints

- **Main bundle stays ESM; sandboxed preload stays CJS** — do not add `require()` to the main bundle; use `import`/`import type`. (See project memory: ESM build constraints.)
- **No new runtime dependencies** — window-state persistence is hand-rolled to avoid the Forge Vite packaging dep-closure problem. (See project memory: Packaging dep closure.)
- **Electron main modules must not `import` the `electron` package at module top in unit-tested files** — the `node` Vitest env can't resolve it. Use `import type` only, and inject runtime Electron/fs through parameters.
- **Biome formatting:** tabs for indentation, double quotes, line width 125. Run `pnpm lint` and `pnpm typecheck` clean before each commit.
- **Settings persistence:** the persisted store is `beacon.settings` (localStorage). Do **not** bump its `version`; a version change without a `migrate` discards saved settings.
- **Test commands:** `pnpm test` runs everything; target a project with `npx vitest run --project renderer <path>` or `--project node <path>`.

---

### Task 1: IPv6 chip ellipsis (CSS only)

Long IPv6 chips currently clip at the pane edge. Make the IP chips shrink and ellipsize in the Services tree, the Hosts tree, and the All view.

**Files:**
- Modify: `src/renderer/components/rows/Rows.module.css` (`.grayChip, .accentChip` rule)
- Modify: `src/renderer/components/rows/FlatRow.module.css` (`.chip` rule)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (presentational only)

- [ ] **Step 1: Add ellipsis properties to the tree chips**

In `src/renderer/components/rows/Rows.module.css`, replace the `.grayChip, .accentChip` rule:

```css
.grayChip,
.accentChip {
	font-family: var(--code-font-family);
	font-size: 11px;
	padding: 1px 6px;
	border-radius: 5px;
	margin-right: 6px;
	white-space: nowrap;
	min-width: 0;
	max-width: 50%;
	flex-shrink: 1;
	overflow: hidden;
	text-overflow: ellipsis;
}
```

- [ ] **Step 2: Add ellipsis properties to the flat-row chip**

In `src/renderer/components/rows/FlatRow.module.css`, replace the `.chip` rule:

```css
.chip {
	font-family: var(--code-font-family);
	font-size: 11px;
	color: var(--accent-11);
	background: var(--accent-a2);
	padding: 1px 6px;
	border-radius: 5px;
	margin-right: 6px;
	white-space: nowrap;
	min-width: 0;
	max-width: 50%;
	flex-shrink: 1;
	overflow: hidden;
	text-overflow: ellipsis;
}
```

- [ ] **Step 3: Verify the existing suite still passes**

Run: `pnpm test`
Expected: PASS (no behavior change; CSS only).

- [ ] **Step 4: Manual check (run the app)**

Run: `pnpm start`. In the Services view, expand `_airplay._tcp` and confirm an IPv6-only host (e.g. Television) shows an ellipsized chip (`fdc9:5672:bcfa:…`) that never clips past the pane edge. Confirm the same in the All view.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/rows/Rows.module.css src/renderer/components/rows/FlatRow.module.css
git commit -m "fix(list): ellipsize long IP chips instead of clipping"
```

---

### Task 2: Host subtitle shows IP, not duplicate name (selectors)

In the Hosts view each row shows its name twice (white title + gray hostname). Replace the gray subtitle with the host's primary IP, and drop the now-redundant IP chip.

**Files:**
- Modify: `src/renderer/lib/selectors.ts` (`buildHostTree`, ~lines 183-201)
- Test: `src/renderer/lib/selectors.test.ts` (`buildHostTree` describe block, ~lines 120-132)

**Interfaces:**
- Consumes: `primaryIp(host)` from `src/renderer/lib/presence.ts` (already imported in selectors.ts)
- Produces: `buildHostTree` group objects now have `subtitle = primaryIp(host) ?? undefined` and `chip = null`

- [ ] **Step 1: Update the failing tests**

In `src/renderer/lib/selectors.test.ts`, replace the entire `describe("buildHostTree", …)` block (currently ~lines 120-132) with:

```ts
describe("buildHostTree", () => {
	it("groups by host (sorted by display name); subtitle = primary ip, chip removed, children sorted by service type", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups.map((g) => g.title)).toEqual(["Aqara Hub", "Mac Studio"]);
		const macGroup = groups[1]!;
		expect(macGroup.subtitle).toBe("10.0.0.2");
		expect(macGroup.chip).toBeNull();
		expect(macGroup.children.map((c) => c.title)).toEqual(["_airplay._tcp", "_ssh._tcp"]);
	});
	it("host subtitle is undefined when the host has no known address", () => {
		const ghost: Host = {
			id: "ghost",
			displayName: "Ghost",
			hostname: "Ghost.local.",
			addresses: [],
			firstSeen: 0,
			lastSeen: 0,
			present: true,
		};
		const ghostHosts = new Map<string, Host>([["ghost", ghost]]);
		const ghostInsts = [i({ key: "g", name: "Ghost", serviceType: "_http._tcp", hostId: "ghost" })];
		const groups = buildHostTree(ghostInsts, ctx({ hosts: ghostHosts }));
		expect(groups[0]!.subtitle).toBeUndefined();
		expect(groups[0]!.chip).toBeNull();
	});
	it("child subtitle appears only when instance name differs from host name", () => {
		const groups = buildHostTree(insts, ctx({ expanded: new Set(["host:mac"]) }));
		expect(groups[1]!.children[0]!.subtitle).toBeUndefined(); // "Mac Studio" == host display name
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project renderer src/renderer/lib/selectors.test.ts`
Expected: FAIL — `macGroup.subtitle` is currently `"Mac.local."` (not `"10.0.0.2"`) and `macGroup.chip` is `"10.0.0.2"` (not `null`).

- [ ] **Step 3: Update `buildHostTree`**

In `src/renderer/lib/selectors.ts`, in the object returned by `buildHostTree`'s `.map(...)`, change two fields:

```ts
				return {
					id: `host:${hid}`,
					title: h?.displayName ?? hid,
					subtitle: primaryIp(h) ?? undefined,
					count: list.length,
					chip: null,
					expanded,
					selected: ctx.selection?.kind === "host" && ctx.selection.id === hid,
					children: expanded
						? list.map((it) =>
								childOf(it, ctx, {
									title: it.serviceType,
									subtitle: it.name !== h?.displayName ? it.name : undefined,
									chip: null,
								}),
							)
						: [],
				};
```

(Only `subtitle` and the group-level `chip` change; everything else stays as-is.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project renderer src/renderer/lib/selectors.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/selectors.ts src/renderer/lib/selectors.test.ts
git commit -m "feat(hosts): show primary IP as host subtitle, drop duplicate name"
```

---

### Task 3: Classic SegmentedControl variant (no custom outline)

Switch the view switcher to Radix's `classic` variant for a more defined look and remove the custom `.segmented` style.

**Files:**
- Modify: `src/renderer/components/Toolbar.tsx` (`SegmentedControl.Root`, ~lines 33-44)
- Modify: `src/renderer/components/Toolbar.module.css` (remove `.segmented`)

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Set `variant="classic"` and drop the `.segmented` class**

In `src/renderer/components/Toolbar.tsx`, change the opening `SegmentedControl.Root` tag (keep the children unchanged):

```tsx
			<SegmentedControl.Root
				size="1"
				variant="classic"
				value={mode}
				onValueChange={(v) => setMode(v as Lens)}
				className="bcn-no-drag"
			>
```

- [ ] **Step 2: Remove the `.segmented` rule**

In `src/renderer/components/Toolbar.module.css`, delete the rule:

```css
.segmented {
	margin-left: 8px;
}
```

(The toolbar's `gap: 8px` in `tokens.css` already spaces the controls.)

- [ ] **Step 3: Run the Toolbar tests**

Run: `npx vitest run --project renderer src/renderer/components/Toolbar.test.tsx`
Expected: PASS (tests click the "Hosts" label text, unaffected by variant/class changes).

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean (no unused `styles.segmented` reference remains — `styles` is still used elsewhere in Toolbar? It is not; see note).

> Note: after removing `styles.segmented`, check whether `styles` is still referenced in `Toolbar.tsx`. It still is (`styles.logoBlock`, `styles.spacer`, `styles.refreshIcon`, `styles.spin`), so the `import styles from "./Toolbar.module.css"` line stays.

- [ ] **Step 5: Manual check (run the app)**

Run: `pnpm start`. Confirm the selected view segment looks raised/defined and the control spacing is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/Toolbar.tsx src/renderer/components/Toolbar.module.css
git commit -m "style(toolbar): use Radix classic SegmentedControl variant"
```

---

### Task 4: Pane-width clamp helper + persisted setting

Add the clamp helper and the persisted `listPaneWidth` field that the resizable pane (Task 5) consumes.

**Files:**
- Create: `src/renderer/lib/paneWidth.ts`
- Create: `src/renderer/lib/paneWidth.test.ts`
- Modify: `src/renderer/store/settingsStore.ts`
- Test: `src/renderer/store/settingsStore.test.ts`

**Interfaces:**
- Produces: `clampPaneWidth(px: number): number`, constants `PANE_MIN = 260`, `PANE_MAX = 640`, `PANE_DEFAULT = 384`
- Produces: settings store gains `listPaneWidth: number` and `setListPaneWidth(px: number): void`

- [ ] **Step 1: Write the failing clamp test**

Create `src/renderer/lib/paneWidth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clampPaneWidth, PANE_DEFAULT, PANE_MAX, PANE_MIN } from "./paneWidth";

describe("clampPaneWidth", () => {
	it("clamps values below the minimum up to PANE_MIN", () => {
		expect(clampPaneWidth(100)).toBe(PANE_MIN);
	});
	it("clamps values above the maximum down to PANE_MAX", () => {
		expect(clampPaneWidth(9999)).toBe(PANE_MAX);
	});
	it("floors fractional in-range values", () => {
		expect(clampPaneWidth(400.7)).toBe(400);
	});
	it("returns the default for non-finite input", () => {
		expect(clampPaneWidth(Number.NaN)).toBe(PANE_DEFAULT);
	});
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run --project renderer src/renderer/lib/paneWidth.test.ts`
Expected: FAIL — `Cannot find module './paneWidth'`.

- [ ] **Step 3: Implement the helper**

Create `src/renderer/lib/paneWidth.ts`:

```ts
export const PANE_MIN = 260;
export const PANE_MAX = 640;
export const PANE_DEFAULT = 384;

export function clampPaneWidth(px: number): number {
	if (!Number.isFinite(px)) return PANE_DEFAULT;
	return Math.min(PANE_MAX, Math.max(PANE_MIN, Math.floor(px)));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --project renderer src/renderer/lib/paneWidth.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing settings-store test**

In `src/renderer/store/settingsStore.test.ts`, add `listPaneWidth: 384` to the `beforeEach` `setState` reset object, and add this test inside the `describe("settingsStore", …)` block:

```ts
	it("setListPaneWidth clamps and stores the width", () => {
		useSettingsStore.getState().setListPaneWidth(100);
		expect(useSettingsStore.getState().listPaneWidth).toBe(260);
		useSettingsStore.getState().setListPaneWidth(400);
		expect(useSettingsStore.getState().listPaneWidth).toBe(400);
	});
```

The updated `beforeEach` reset object becomes:

```ts
	useSettingsStore.setState({
		appearance: "dark",
		mode: "service",
		sortBy: "name",
		showDesc: true,
		showV6: true,
		showLinkLocal: true,
		listPaneWidth: 384,
	});
```

- [ ] **Step 6: Run it to verify failure**

Run: `npx vitest run --project renderer src/renderer/store/settingsStore.test.ts`
Expected: FAIL — `setListPaneWidth` is not a function.

- [ ] **Step 7: Add the field + action to the store**

In `src/renderer/store/settingsStore.ts`:

Add the import at the top:

```ts
import { clampPaneWidth, PANE_DEFAULT } from "../lib/paneWidth";
```

Add to the `SettingsState` interface:

```ts
	listPaneWidth: number;
	setListPaneWidth: (px: number) => void;
```

Add to the initial state object (e.g. after `showLinkLocal: true,`):

```ts
				listPaneWidth: PANE_DEFAULT,
```

Add the action (e.g. after `toggleShowLinkLocal`):

```ts
				setListPaneWidth: (px) => set({ listPaneWidth: clampPaneWidth(px) }),
```

Leave `{ name: "beacon.settings", version: 1 }` unchanged (no version bump — see Global Constraints).

- [ ] **Step 8: Run the store tests to verify they pass**

Run: `npx vitest run --project renderer src/renderer/store/settingsStore.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/lib/paneWidth.ts src/renderer/lib/paneWidth.test.ts src/renderer/store/settingsStore.ts src/renderer/store/settingsStore.test.ts
git commit -m "feat(settings): add persisted listPaneWidth with clamp helper"
```

---

### Task 5: Resizable list pane (divider + App wiring)

Add a drag handle between the panes that updates `listPaneWidth` live; drive the pane width from the store.

**Files:**
- Create: `src/renderer/components/PaneDivider.tsx`
- Create: `src/renderer/components/PaneDivider.module.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/tokens.css` (`.bcn-list-pane` flex)

**Interfaces:**
- Consumes: `useSettingsStore` `listPaneWidth` + `setListPaneWidth` (Task 4)
- Produces: `<PaneDivider />` component (no props)

- [ ] **Step 1: Create the divider component**

Create `src/renderer/components/PaneDivider.tsx`:

```tsx
import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./PaneDivider.module.css";

export function PaneDivider() {
	const setListPaneWidth = useSettingsStore((s) => s.setListPaneWidth);
	const dragging = useRef(false);
	const bodyLeft = useRef(0);

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		const body = e.currentTarget.parentElement;
		if (!body) return;
		bodyLeft.current = body.getBoundingClientRect().left;
		dragging.current = true;
		e.currentTarget.setPointerCapture(e.pointerId);
	};
	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (!dragging.current) return;
		setListPaneWidth(e.clientX - bodyLeft.current);
	};
	const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		dragging.current = false;
		e.currentTarget.releasePointerCapture(e.pointerId);
	};

	return (
		<div
			className={`${styles.divider} bcn-no-drag`}
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize list pane"
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		/>
	);
}
```

- [ ] **Step 2: Create the divider styles**

Create `src/renderer/components/PaneDivider.module.css`:

```css
.divider {
	flex: 0 0 6px;
	margin: 0 -3px;
	cursor: col-resize;
	background: transparent;
	z-index: 1;
	transition: background 0.12s;
}
.divider:hover,
.divider:active {
	background: var(--accent-a5);
}
```

(The `-3px` horizontal margin lets the 6px hit-area straddle the pane border without adding visible layout width.)

- [ ] **Step 3: Wire the divider and store width into App**

In `src/renderer/App.tsx`, add imports:

```ts
import { PaneDivider } from "./components/PaneDivider";
import { useSettingsStore } from "./store/settingsStore";
```

Inside `App()`, read the width (alongside the other `useDiscoveryStore` reads):

```ts
	const listPaneWidth = useSettingsStore((s) => s.listPaneWidth);
```

Replace the `.bcn-body` block with:

```tsx
				<div className="bcn-body">
					<section className="bcn-list-pane" style={{ width: listPaneWidth }}>
						<ListPane />
					</section>
					<PaneDivider />
					<section className="bcn-detail-pane">
						<DetailPane />
					</section>
				</div>
```

- [ ] **Step 4: Make the list pane width-driven**

In `src/renderer/styles/tokens.css`, in the `.bcn-list-pane` rule, change:

```css
	flex: 0 0 384px;
```

to:

```css
	flex: 0 0 auto;
```

(Leave `min-width: 0` and the rest of the rule unchanged. Width now comes from the inline style.)

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS (App and ListPane tests still render; the store provides `listPaneWidth` from Task 4).

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Manual check (run the app)**

Run: `pnpm start`. Hover the seam between the list and detail panes (cursor becomes `col-resize`), drag to resize, confirm it stops at the 260/640 bounds, then reload (Cmd+R) and confirm the width persisted.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/PaneDivider.tsx src/renderer/components/PaneDivider.module.css src/renderer/App.tsx src/renderer/styles/tokens.css
git commit -m "feat(layout): resizable, persisted list pane via drag divider"
```

---

### Task 6: Window-state module (pure, unit-tested)

A dependency-free module that computes restorable window bounds from persisted JSON and saves bounds on change. Electron/fs are injected so the logic is unit-testable in the `node` env.

**Files:**
- Create: `src/main/windowState.ts`
- Create: `src/main/windowState.test.ts`

**Interfaces:**
- Produces:
  - `interface WindowState { width: number; height: number; x?: number; y?: number; isMaximized: boolean }`
  - `interface WindowStateIo { read(): string | null; write(data: string): void; isOnScreen(rect: Rectangle): boolean }`
  - `loadWindowState(io: WindowStateIo): WindowState`
  - `manageWindow(win: BrowserWindow, io: WindowStateIo): void`

- [ ] **Step 1: Write the failing test**

Create `src/main/windowState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadWindowState, type WindowStateIo } from "./windowState";

function io(over: Partial<WindowStateIo> = {}): WindowStateIo {
	return {
		read: () => null,
		write: () => {},
		isOnScreen: () => true,
		...over,
	};
}

describe("loadWindowState", () => {
	it("returns defaults when no file exists", () => {
		expect(loadWindowState(io())).toEqual({ width: 1100, height: 720, isMaximized: false });
	});
	it("returns defaults on corrupt JSON", () => {
		expect(loadWindowState(io({ read: () => "{not json" }))).toEqual({ width: 1100, height: 720, isMaximized: false });
	});
	it("returns saved on-screen bounds verbatim", () => {
		const raw = JSON.stringify({ width: 900, height: 600, x: 100, y: 80, isMaximized: false });
		expect(loadWindowState(io({ read: () => raw, isOnScreen: () => true }))).toEqual({
			width: 900,
			height: 600,
			x: 100,
			y: 80,
			isMaximized: false,
		});
	});
	it("drops x/y when bounds are off-screen but keeps the size", () => {
		const raw = JSON.stringify({ width: 900, height: 600, x: -5000, y: -5000, isMaximized: false });
		expect(loadWindowState(io({ read: () => raw, isOnScreen: () => false }))).toEqual({
			width: 900,
			height: 600,
			isMaximized: false,
		});
	});
	it("preserves isMaximized and falls back to default size when invalid", () => {
		const raw = JSON.stringify({ width: 0, height: -10, isMaximized: true });
		expect(loadWindowState(io({ read: () => raw }))).toEqual({ width: 1100, height: 720, isMaximized: true });
	});
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run --project node src/main/windowState.test.ts`
Expected: FAIL — `Cannot find module './windowState'`.

- [ ] **Step 3: Implement the module**

Create `src/main/windowState.ts`:

```ts
import type { BrowserWindow, Rectangle } from "electron";

export interface WindowState {
	width: number;
	height: number;
	x?: number;
	y?: number;
	isMaximized: boolean;
}

export interface WindowStateIo {
	read(): string | null;
	write(data: string): void;
	isOnScreen(rect: Rectangle): boolean;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 720;

function positive(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadWindowState(io: WindowStateIo): WindowState {
	const raw = io.read();
	if (!raw) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, isMaximized: false };

	let parsed: Partial<WindowState>;
	try {
		parsed = JSON.parse(raw) as Partial<WindowState>;
	} catch {
		return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, isMaximized: false };
	}

	const width = positive(parsed.width, DEFAULT_WIDTH);
	const height = positive(parsed.height, DEFAULT_HEIGHT);
	const state: WindowState = { width, height, isMaximized: parsed.isMaximized === true };

	if (typeof parsed.x === "number" && typeof parsed.y === "number") {
		const rect = { x: parsed.x, y: parsed.y, width, height };
		if (io.isOnScreen(rect)) {
			state.x = parsed.x;
			state.y = parsed.y;
		}
	}
	return state;
}

export function manageWindow(win: BrowserWindow, io: WindowStateIo): void {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const save = (): void => {
		// While maximized, persist the underlying normal bounds so un-maximize restores correctly.
		const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
		const state: WindowState = {
			width: bounds.width,
			height: bounds.height,
			x: bounds.x,
			y: bounds.y,
			isMaximized: win.isMaximized(),
		};
		io.write(JSON.stringify(state));
	};

	const debouncedSave = (): void => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(save, 300);
	};

	win.on("resize", debouncedSave);
	win.on("move", debouncedSave);
	win.on("close", () => {
		if (timer) clearTimeout(timer);
		save();
	});
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run --project node src/main/windowState.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/windowState.ts src/main/windowState.test.ts
git commit -m "feat(main): add dependency-free window-state load/save module"
```

---

### Task 7: Wire window-state persistence into the main process

Build the real Electron-backed IO and use it to seed and manage the window.

**Files:**
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: `loadWindowState`, `manageWindow`, `WindowStateIo` from Task 6

- [ ] **Step 1: Add imports and the real IO factory**

In `src/main/main.ts`, update the imports at the top (add `fs`, `Rectangle`, `screen`, and the windowState module):

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, type Rectangle, screen } from "electron";
import { registerDiscoveryIpc } from "./ipc/registerDiscoveryIpc";
import { loadWindowState, manageWindow, type WindowStateIo } from "./windowState";
```

Add this factory above `createWindow` (after the `dirname` definition):

```ts
function windowStateIo(): WindowStateIo {
	const file = path.join(app.getPath("userData"), "window-state.json");
	return {
		read: () => {
			try {
				return fs.readFileSync(file, "utf8");
			} catch {
				return null;
			}
		},
		write: (data) => {
			try {
				fs.writeFileSync(file, data);
			} catch {
				/* best-effort: a failed save must never crash the window */
			}
		},
		isOnScreen: (rect: Rectangle) => {
			try {
				const area = screen.getDisplayMatching(rect).workArea;
				return (
					rect.x < area.x + area.width &&
					rect.x + rect.width > area.x &&
					rect.y < area.y + area.height &&
					rect.y + rect.height > area.y
				);
			} catch {
				return true;
			}
		},
	};
}
```

- [ ] **Step 2: Seed and manage the window in `createWindow`**

In `createWindow`, replace the `const win = new BrowserWindow({...})` construction and add management. The function becomes:

```ts
function createWindow(): void {
	const isMac = process.platform === "darwin";
	const io = windowStateIo();
	const saved = loadWindowState(io);
	const win = new BrowserWindow({
		width: saved.width,
		height: saved.height,
		x: saved.x,
		y: saved.y,
		titleBarStyle: isMac ? "hiddenInset" : "default",
		// hiddenInset positions the traffic lights for a standard ~28px title bar;
		// nudge them down/right to sit centered in our taller 46px toolbar
		// (.bcn-toolbar height) and align with the design mockup.
		trafficLightPosition: isMac ? { x: 13, y: 16 } : undefined,
		webPreferences: {
			preload: path.join(dirname, "preload.js"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	if (saved.isMaximized) win.maximize();
	manageWindow(win, io);
	registerDiscoveryIpc(win);
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		void win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		void win.loadFile(path.join(dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
	}
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS (no test imports `main.ts`; this confirms nothing else broke).

- [ ] **Step 5: Manual check (run the app)**

Run: `pnpm start`. Resize and move the window, optionally maximize, then quit (Cmd+Q) and relaunch (`pnpm start`). Confirm the window restores its previous size/position (and maximized state).

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts
git commit -m "feat(main): persist and restore window bounds across launches"
```

---

### Task 8: SPA navigation module (renderer)

Track `{ mode, selection }` as browser-history locations: push on user changes, apply on `popstate`. Add a `clearSelection` store action used when applying a null selection.

**Files:**
- Create: `src/renderer/lib/navigation.ts`
- Create: `src/renderer/lib/navigation.test.ts`
- Modify: `src/renderer/store/discoveryStore.ts` (add `clearSelection`)

**Interfaces:**
- Consumes: `useSettingsStore` (`mode`, `setMode`), `useDiscoveryStore` (`selection`, `selectInst`/`selectSvc`/`selectHost`/`selectIp`, new `clearSelection`)
- Produces:
  - `interface NavLocation { mode: Lens; selection: Selection | null }`
  - `currentLocation(): NavLocation`
  - `sameLocation(a: NavLocation, b: NavLocation): boolean`
  - `installNavigation(deps?: { history?: History; win?: Window }): () => void`

- [ ] **Step 1: Add `clearSelection` to the discovery store**

In `src/renderer/store/discoveryStore.ts`, add to the `DiscoveryState` interface (near the other `select*` declarations):

```ts
	clearSelection: () => void;
```

Add the implementation (after `selectIp`):

```ts
	clearSelection: () => set({ selection: null }),
```

- [ ] **Step 2: Write the failing navigation test**

Create `src/renderer/lib/navigation.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { installNavigation, type NavLocation } from "./navigation";

function fakeHistory() {
	const pushed: NavLocation[] = [];
	const box: { replaced: NavLocation | null } = { replaced: null };
	const history = {
		pushState: (state: NavLocation) => {
			pushed.push(state);
		},
		replaceState: (state: NavLocation) => {
			box.replaced = state;
		},
	} as unknown as History;
	return { history, pushed, box };
}

function popstate(state: NavLocation | null) {
	window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

beforeEach(() => {
	useSettingsStore.setState({ mode: "service" });
	useDiscoveryStore.setState({ selection: null, query: "", expanded: new Set() });
});

describe("installNavigation", () => {
	it("seeds the initial entry with replaceState", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		expect(h.box.replaced).toEqual({ mode: "service", selection: null });
		dispose();
	});

	it("pushes when the user changes mode", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useSettingsStore.getState().setMode("host");
		expect(h.pushed).toEqual([{ mode: "host", selection: null }]);
		dispose();
	});

	it("pushes when the user changes selection", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useDiscoveryStore.getState().selectHost("mac");
		expect(h.pushed).toEqual([{ mode: "service", selection: { kind: "host", id: "mac" } }]);
		dispose();
	});

	it("does not push for search-query changes", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useDiscoveryStore.getState().setQuery("shelly");
		expect(h.pushed).toEqual([]);
		dispose();
	});

	it("does not push for a no-op (same location) change", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useSettingsStore.getState().setMode("service");
		expect(h.pushed).toEqual([]);
		dispose();
	});

	it("applies a popstate location into the stores without re-pushing", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useSettingsStore.getState().setMode("host"); // one push
		popstate({ mode: "ip", selection: { kind: "host", id: "mac" } });
		expect(useSettingsStore.getState().mode).toBe("ip");
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "host", id: "mac" });
		expect(h.pushed).toHaveLength(1); // apply must not push
		dispose();
	});

	it("applies a null selection on popstate", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		useDiscoveryStore.getState().selectHost("mac");
		popstate({ mode: "service", selection: null });
		expect(useDiscoveryStore.getState().selection).toBeNull();
		dispose();
	});

	it("stops pushing after dispose", () => {
		const h = fakeHistory();
		const dispose = installNavigation({ history: h.history, win: window });
		dispose();
		useSettingsStore.getState().setMode("all");
		expect(h.pushed).toEqual([]);
	});
});
```

- [ ] **Step 3: Run it to verify failure**

Run: `npx vitest run --project renderer src/renderer/lib/navigation.test.ts`
Expected: FAIL — `Cannot find module './navigation'`.

- [ ] **Step 4: Implement the navigation module**

Create `src/renderer/lib/navigation.ts`:

```ts
import { type Selection, useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";

export interface NavLocation {
	mode: Lens;
	selection: Selection | null;
}

export function currentLocation(): NavLocation {
	return {
		mode: useSettingsStore.getState().mode,
		selection: useDiscoveryStore.getState().selection,
	};
}

export function sameLocation(a: NavLocation, b: NavLocation): boolean {
	if (a.mode !== b.mode) return false;
	const sa = a.selection;
	const sb = b.selection;
	if (sa === null || sb === null) return sa === sb;
	return sa.kind === sb.kind && sa.id === sb.id;
}

function applyLocation(loc: NavLocation): void {
	const disco = useDiscoveryStore.getState();
	useSettingsStore.getState().setMode(loc.mode);
	const sel = loc.selection;
	if (!sel) disco.clearSelection();
	else if (sel.kind === "inst") disco.selectInst(sel.id);
	else if (sel.kind === "svc") disco.selectSvc(sel.id);
	else if (sel.kind === "host") disco.selectHost(sel.id);
	else disco.selectIp(sel.id);
}

export function installNavigation(deps: { history?: History; win?: Window } = {}): () => void {
	const history = deps.history ?? window.history;
	const win = deps.win ?? window;

	let applying = false;
	let last = currentLocation();
	history.replaceState(last, "");

	const maybePush = (): void => {
		if (applying) return;
		const next = currentLocation();
		if (sameLocation(next, last)) return;
		last = next;
		history.pushState(next, "");
	};

	const onPopState = (e: PopStateEvent): void => {
		const loc = (e.state as NavLocation | null) ?? { mode: "service", selection: null };
		applying = true;
		applyLocation(loc);
		last = currentLocation();
		applying = false;
	};

	const unsubMode = useSettingsStore.subscribe(maybePush);
	const unsubSelection = useDiscoveryStore.subscribe(maybePush);
	win.addEventListener("popstate", onPopState);

	return () => {
		unsubMode();
		unsubSelection();
		win.removeEventListener("popstate", onPopState);
	};
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run --project renderer src/renderer/lib/navigation.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/lib/navigation.ts src/renderer/lib/navigation.test.ts src/renderer/store/discoveryStore.ts
git commit -m "feat(nav): history-backed location push/apply module"
```

---

### Task 9: Keyboard back/forward shortcuts

Add Cmd/Ctrl+`[` / `]` and Cmd/Ctrl+`ArrowLeft` / `ArrowRight` to walk the history.

**Files:**
- Modify: `src/renderer/lib/keyboard.ts`
- Test: `src/renderer/lib/keyboard.test.ts`

**Interfaces:**
- Consumes: `window.history.back()` / `window.history.forward()`
- Produces: nothing new (extends `installKeyboard`)

- [ ] **Step 1: Write the failing tests**

In `src/renderer/lib/keyboard.test.ts`, add inside the `describe("installKeyboard", …)` block:

```ts
	it("Cmd+[ goes back and Cmd+] goes forward", () => {
		const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
		const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
		const off = installKeyboard();
		key({ key: "[", metaKey: true });
		expect(back).toHaveBeenCalledTimes(1);
		key({ key: "]", metaKey: true });
		expect(forward).toHaveBeenCalledTimes(1);
		off();
		back.mockRestore();
		forward.mockRestore();
	});
	it("Cmd+ArrowLeft/ArrowRight navigate history", () => {
		const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
		const forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
		const off = installKeyboard();
		key({ key: "ArrowLeft", metaKey: true });
		key({ key: "ArrowRight", metaKey: true });
		expect(back).toHaveBeenCalledTimes(1);
		expect(forward).toHaveBeenCalledTimes(1);
		off();
		back.mockRestore();
		forward.mockRestore();
	});
	it("does not navigate history while typing in the search field", () => {
		const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
		const off = installKeyboard();
		const input = document.getElementById("beacon-search") as HTMLInputElement;
		input.focus();
		input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "[", metaKey: true }));
		expect(back).not.toHaveBeenCalled();
		off();
		back.mockRestore();
	});
```

- [ ] **Step 2: Run them to verify failure**

Run: `npx vitest run --project renderer src/renderer/lib/keyboard.test.ts`
Expected: FAIL — `back`/`forward` not called.

- [ ] **Step 3: Add the shortcuts**

In `src/renderer/lib/keyboard.ts`, insert this block immediately **after** the `typing` early-return block (the `if (typing) { … return; }`) and **before** `if (e.metaKey || e.ctrlKey || e.altKey) return;`:

```ts
		if (e.metaKey || e.ctrlKey) {
			if (e.key === "[" || e.key === "ArrowLeft") {
				e.preventDefault();
				window.history.back();
				return;
			}
			if (e.key === "]" || e.key === "ArrowRight") {
				e.preventDefault();
				window.history.forward();
				return;
			}
		}
```

(Placing it after the `typing` return ensures it never fires while the search field is focused; placing it before the `metaKey` return ensures these combos are handled rather than discarded.)

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run --project renderer src/renderer/lib/keyboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/keyboard.ts src/renderer/lib/keyboard.test.ts
git commit -m "feat(nav): keyboard back/forward shortcuts"
```

---

### Task 10: Install navigation + OS gesture handlers

Activate `installNavigation` in the renderer and wire mouse/trackpad gestures in the main process to `webContents.navigationHistory`.

**Files:**
- Modify: `src/renderer/main.tsx`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: `installNavigation` (Task 8); `win.webContents.navigationHistory` (Electron 42)

- [ ] **Step 1: Install navigation in the renderer**

In `src/renderer/main.tsx`, add the import:

```ts
import { installNavigation } from "./lib/navigation";
```

In `Root()`'s `useEffect`, install navigation alongside the keyboard and tear it down on cleanup. The effect body becomes:

```ts
	useEffect(() => {
		useDiscoveryStore.getState().tick(Date.now());
		const clock = setInterval(() => useDiscoveryStore.getState().tick(Date.now()), 1000);
		const removeKeys = installKeyboard();
		const removeNav = installNavigation();
		return () => {
			clearInterval(clock);
			removeKeys();
			removeNav();
		};
	}, []);
```

- [ ] **Step 2: Wire mouse + trackpad gestures in the main process**

In `src/main/main.ts`, inside `createWindow`, after `manageWindow(win, io);` and before `registerDiscoveryIpc(win);`, add:

```ts
	// OS-level navigation gestures funnel into the same Chromium history stack the
	// renderer drives via the History API, so each fires the renderer's popstate.
	const navHistory = () => win.webContents.navigationHistory;
	win.on("app-command", (_e, command) => {
		if (command === "browser-backward" && navHistory().canGoBack()) navHistory().goBack();
		else if (command === "browser-forward" && navHistory().canGoForward()) navHistory().goForward();
	});
	win.on("swipe", (_e, direction) => {
		if (direction === "left" && navHistory().canGoBack()) navHistory().goBack();
		else if (direction === "right" && navHistory().canGoForward()) navHistory().goForward();
	});
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Manual check (run the app)**

Run: `pnpm start`. Select several items and switch views, then:
- Press Cmd+[ repeatedly and confirm the selection/view walks backward; Cmd+] walks forward.
- If you have a mouse with side buttons, click back/forward.
- On a Mac trackpad, two-finger swipe left/right (and/or three-finger if configured) to navigate.

Confirm going back past the first action does not navigate the app away from itself (it simply stops).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/main.tsx src/main/main.ts
git commit -m "feat(nav): activate navigation + wire mouse/trackpad gestures"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|--------------|---------|
| 1 IPv6 chip overflow | Task 1 |
| 2 Duplicate host name → IP | Task 2 |
| 3 Resizable, persisted list pane | Task 4 (helper+store), Task 5 (divider+wiring) |
| 4 Persisted window bounds | Task 6 (module), Task 7 (wiring) |
| 5 Back/forward navigation | Task 8 (module), Task 9 (keyboard), Task 10 (install+gestures) |
| 6 Segmented control | Task 3 |
| Testing (TDD) | Tasks 2, 4, 6, 8, 9 carry unit tests; 1, 3, 5, 7, 10 are run-app verified per spec |

No spec requirement is left without a task.

**Type consistency:** `NavLocation`, `WindowState`, `WindowStateIo`, `clampPaneWidth`, `PANE_MIN/MAX/DEFAULT`, `setListPaneWidth`, and `clearSelection` are each defined in exactly one task and consumed with matching signatures downstream. `Selection`/`Lens` are imported from their existing store modules. The Hosts-tree change keeps the existing `TreeGroup` shape (`subtitle?: string`, `chip: string | null`).

**Placeholder scan:** No TBD/TODO; every code step shows complete content. Empty `catch` blocks carry explanatory comments (Biome-safe).
