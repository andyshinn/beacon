# Beacon Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the finished Beacon brand (Lexend + JetBrains Mono typography, the mark+wordmark title-bar logo, and the application/favicon icons) to the Electron app.

**Architecture:** Renderer gets bundled variable fonts via `@fontsource-variable/*` (Vite inlines the woff2, so no runtime `node_modules` dependency) plus Radix font-token overrides; a new inline-SVG `BrandLockup` replaces the placeholder logo in the toolbar; a `scripts/generate-icons.ts` build step turns the supplied 1024px master into `.icns`/`.ico`/`.png` wired through `forge.config.ts`, and `beacon-icon.svg` becomes the renderer favicon.

**Tech Stack:** Electron Forge + Vite, React 19, Radix Themes, Zustand, Vitest, TypeScript, tsx. Icon tooling: `sips`, `iconutil`, ImageMagick (`magick`) — all confirmed present on this machine.

## Global Constraints

- Package manager is **pnpm** (not npm/yarn). Use `pnpm add`, `pnpm test`, etc.
- **No color/surface changes** to `tokens.css` beyond removing dead logo rules and adding font-family overrides. The dark/light surfaces stay exactly as-is.
- Accent is already Radix `indigo` (= brand `#3E63DD`); do **not** change `accentColor`.
- Bundled fonts must work **offline** — no Google Fonts CDN `<link>`.
- Brand copy: app + product name is exactly **"Beacon"**; wordmark logotype renders lowercase "beacon" (that is the glyph design, not a copy change).
- Brand gradient: `#6E82EE → #3E63DD → #2B46B8` (vertical). Mark min 24px, icon min 16px.
- Git commits are **deferred to the user** — do not commit (the working tree has unrelated in-progress menu work). Stage nothing.
- Run `pnpm lint:fix` (Biome) before declaring a task done; the repo uses tab indentation.

---

### Task 1: Bundle Lexend + JetBrains Mono and override Radix font tokens

**Files:**
- Modify: `package.json` (dependencies + `icons` script comes later; here just deps)
- Create: `src/renderer/styles/fonts.css`
- Modify: `src/renderer/main.tsx:1-6` (import fonts)
- Modify: `src/renderer/styles/tokens.css:9-17` (add font-family vars to `:root`)

**Interfaces:**
- Produces: CSS custom properties `--default-font-family` and `--code-font-family` overridden app-wide; font families `"Lexend Variable"` and `"JetBrains Mono Variable"` available.

- [ ] **Step 1: Add the font packages**

```bash
pnpm add @fontsource-variable/lexend @fontsource-variable/jetbrains-mono
```

- [ ] **Step 2: Create `src/renderer/styles/fonts.css`** with the Radix token overrides (the `@font-face` rules come from the JS imports in Step 3):

```css
/* Brand typography. The font files are bundled by Vite via the JS imports in
   main.tsx (@fontsource-variable/*); these vars repoint Radix Themes' font
   tokens at them so every component + all var(--code-font-family) mono cells
   pick them up. Set on :root (covers html/body, which sit outside <Theme>) and
   .radix-themes (the Theme root) so both scopes resolve the brand stack. */
:root,
.radix-themes {
	--default-font-family: "Lexend Variable", -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
	--code-font-family: "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	--heading-font-family: var(--default-font-family);
	--strong-font-family: var(--default-font-family);
}
```

- [ ] **Step 3: Import fonts in `src/renderer/main.tsx`.** Add after the Radix styles import (line 4) and before `tokens.css`:

```ts
import "@radix-ui/themes/styles.css";
import "@fontsource-variable/lexend";
import "@fontsource-variable/jetbrains-mono";
import "./styles/fonts.css";
import "./styles/tokens.css";
```

- [ ] **Step 4: Verify build + types**

Run: `pnpm typecheck && pnpm test run 2>/dev/null; pnpm vitest run src/renderer/App.test.tsx`
Expected: typecheck passes; existing tests still pass (fonts are inert in happy-dom).

- [ ] **Step 5: Visual check (manual, deferred to final verification)** — confirmed in Task 6 via `pnpm start`: UI text is Lexend, IP/service mono cells are JetBrains Mono.

---

### Task 2: Vendor brand SVG assets + favicon

**Files:**
- Create: `src/renderer/assets/brand/beacon-icon.svg`
- Create: `src/renderer/assets/brand/beacon-wordmark.svg`
- Create: `src/renderer/assets/brand/beacon-mark.svg`
- Create: `src/renderer/assets/brand/beacon-mark-on-dark.svg`
- Create: `public/favicon.svg` (copy of `beacon-icon.svg`; Vite serves `publicDir` at web root)
- Modify: `index.html:6` (add favicon link)

**Interfaces:**
- Produces: vendored SVG sources whose `d=` path data Task 3 copies into inline React components; a working favicon.

- [ ] **Step 1: Write the four SVG files** using the exact content already pulled from the design project (`beacon-icon.svg`, `beacon-wordmark.svg`, `beacon-mark.svg`, `beacon-mark-on-dark.svg`). These are the canonical assets — paste verbatim.

- [ ] **Step 2: Create `public/favicon.svg`** as a copy of `beacon-icon.svg`.

- [ ] **Step 3: Add favicon link to `index.html`** inside `<head>`:

```html
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

- [ ] **Step 4: Verify** the dev server serves it — covered in Task 6 (`pnpm start`, check the window/taskbar icon and no 404 for `/favicon.svg`).

---

### Task 3: BrandLockup components (TDD) + toolbar integration

**Files:**
- Create: `src/renderer/components/brand/glyphs.ts` (path-data constants)
- Create: `src/renderer/components/brand/BrandLockup.tsx`
- Create: `src/renderer/components/brand/BrandLockup.module.css`
- Create: `src/renderer/components/brand/BrandLockup.test.tsx`
- Modify: `src/renderer/components/Toolbar.tsx:24-31` (replace placeholder)
- Modify: `src/renderer/components/Toolbar.test.tsx` (assert the lockup)
- Modify: `src/renderer/styles/tokens.css:111-132` (delete dead `.bcn-logo`/`.bcn-title` rules)

**Interfaces:**
- Produces: `BeaconMark({ size?: number })`, `BeaconWordmark({ height?: number })`, `BeaconLockup()` — all default exports-free named exports from `BrandLockup.tsx`. `BeaconLockup` renders an element with `role="img"` and `aria-label="Beacon"`.
- Consumes: path-data strings `BEACON_MARK_PATH` and `BEACON_WORDMARK_PATH` from `glyphs.ts` (copied verbatim from the `d=` attributes of `assets/brand/beacon-icon.svg` and `assets/brand/beacon-wordmark.svg`).

- [ ] **Step 1: Write the failing test** `src/renderer/components/brand/BrandLockup.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BeaconLockup } from "./BrandLockup";

describe("BeaconLockup", () => {
	it("exposes the Beacon accessible name", () => {
		render(<BeaconLockup />);
		expect(screen.getByRole("img", { name: "Beacon" })).toBeInTheDocument();
	});

	it("renders the mark gradient and the wordmark path", () => {
		const { container } = render(<BeaconLockup />);
		// gradient = the squircle mark; two <svg> = mark + wordmark
		expect(container.querySelector("linearGradient")).toBeTruthy();
		expect(container.querySelectorAll("svg").length).toBe(2);
	});
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm vitest run src/renderer/components/brand/BrandLockup.test.tsx`
Expected: FAIL — cannot resolve `./BrandLockup`.

- [ ] **Step 3: Create `glyphs.ts`** exporting the two path strings copied from the vendored SVGs:

```ts
// Path data lifted verbatim from assets/brand/beacon-icon.svg (the white "b")
// and assets/brand/beacon-wordmark.svg. Kept here so the marks render inline
// (currentColor-themeable wordmark, no extra requests).
export const BEACON_MARK_PATH = "<copy the b-glyph d= from beacon-icon.svg>";
export const BEACON_WORDMARK_PATH = "<copy the d= from beacon-wordmark.svg>";
```

- [ ] **Step 4: Create `BrandLockup.tsx`:**

```tsx
import { useId } from "react";
import { BEACON_MARK_PATH, BEACON_WORDMARK_PATH } from "./glyphs";
import styles from "./BrandLockup.module.css";

export function BeaconMark({ size = 20 }: { size?: number }) {
	const id = useId();
	return (
		<svg width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">
			<defs>
				<linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor="#6e82ee" />
					<stop offset="0.5" stopColor="#3e63dd" />
					<stop offset="1" stopColor="#2b46b8" />
				</linearGradient>
			</defs>
			<rect width="1024" height="1024" rx="230" fill={`url(#${id})`} />
			<g transform="translate(284,202) scale(0.62)">
				<path fillRule="evenodd" fill="#fff" d={BEACON_MARK_PATH} />
			</g>
			<circle cx="513" cy="595" r="65" fill="#fff" />
		</svg>
	);
}

export function BeaconWordmark({ height = 13 }: { height?: number }) {
	return (
		<svg height={height} viewBox="0 0 4799 1000" fill="none" aria-hidden="true" focusable="false" style={{ display: "block" }}>
			<path fill="currentColor" d={BEACON_WORDMARK_PATH} />
		</svg>
	);
}

export function BeaconLockup() {
	return (
		<span className={styles.lockup} role="img" aria-label="Beacon" title="mDNS / Bonjour browser">
			<BeaconMark size={20} />
			<BeaconWordmark height={13} />
		</span>
	);
}
```

- [ ] **Step 5: Create `BrandLockup.module.css`:**

```css
.lockup {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: var(--gray-12); /* wordmark inherits via currentColor */
	padding-left: 2px;
}
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm vitest run src/renderer/components/brand/BrandLockup.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 7: Integrate into `Toolbar.tsx`.** Replace lines 26-31 (`<div className={styles.logoBlock}>…</div>`) with:

```tsx
			<BeaconLockup />
```

and add the import:

```tsx
import { BeaconLockup } from "./brand/BrandLockup";
```

Remove the now-unused `styles.logoBlock` rule from `Toolbar.module.css` (the lockup carries its own spacing/drag stays via `.bcn-toolbar`'s no-drag children — the lockup is draggable, which is correct for a title-bar brand).

- [ ] **Step 8: Add a toolbar test** in `Toolbar.test.tsx` `describe("Toolbar")`:

```tsx
	it("shows the Beacon brand lockup", () => {
		renderToolbar();
		expect(screen.getByRole("img", { name: "Beacon" })).toBeInTheDocument();
	});
```

- [ ] **Step 9: Delete dead rules** in `tokens.css` — remove `.bcn-logo`, `.bcn-logo::after`, and `.bcn-title` (lines ~111-132). Leave the `@keyframes` and layout rules intact.

- [ ] **Step 10: Run the renderer tests + lint**

Run: `pnpm vitest run src/renderer/components/Toolbar.test.tsx src/renderer/components/brand && pnpm lint:fix`
Expected: PASS; lint clean.

---

### Task 4: Icon generation script + Forge packaging wiring

**Files:**
- Create: `scripts/generate-icons.ts`
- Create (generated, committed): `build/icon.icns`, `build/icon.ico`, `build/icon.png`
- Modify: `package.json` (add `"icons"` script)
- Modify: `forge.config.ts:14-28` (packager + maker icons)

**Interfaces:**
- Produces: `build/icon.{icns,ico,png}`; Forge `packagerConfig.icon` + Linux maker icons point at them.

- [ ] **Step 1: Write `scripts/generate-icons.ts`** (run with tsx, like `scripts/discover.ts`):

```ts
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const master = path.join(root, "logo/icon-macos.icon/Assets/Image.png");
const build = path.join(root, "build");
const iconset = path.join(build, "icon.iconset");

mkdirSync(iconset, { recursive: true });

// macOS .icns — sips resizes the 1024 master into the named iconset slots.
const sizes: [string, number][] = [
	["icon_16x16.png", 16], ["icon_16x16@2x.png", 32],
	["icon_32x32.png", 32], ["icon_32x32@2x.png", 64],
	["icon_128x128.png", 128], ["icon_128x128@2x.png", 256],
	["icon_256x256.png", 256], ["icon_256x256@2x.png", 512],
	["icon_512x512.png", 512], ["icon_512x512@2x.png", 1024],
];
for (const [name, px] of sizes) {
	execFileSync("sips", ["-z", String(px), String(px), master, "--out", path.join(iconset, name)], { stdio: "ignore" });
}
execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(build, "icon.icns")]);
rmSync(iconset, { recursive: true, force: true });

// Windows .ico — ImageMagick auto-resize bundles the standard sizes.
execFileSync("magick", [master, "-define", "icon:auto-resize=256,128,64,48,32,16", path.join(build, "icon.ico")]);

// Linux PNG (deb/rpm makers).
execFileSync("sips", ["-z", "512", "512", master, "--out", path.join(build, "icon.png")], { stdio: "ignore" });

console.log("[icons] wrote build/icon.{icns,ico,png}");
```

- [ ] **Step 2: Add the script** to `package.json` `scripts`:

```json
		"icons": "tsx scripts/generate-icons.ts",
```

- [ ] **Step 3: Run it**

Run: `pnpm icons && ls -l build/icon.icns build/icon.ico build/icon.png`
Expected: three non-empty files; `file build/icon.icns` reports "Mac OS X icon".

- [ ] **Step 4: Wire `forge.config.ts`.** In `packagerConfig` add (e.g. after `asar: true`):

```ts
		icon: "build/icon",
```

and give the Linux makers an icon:

```ts
	makers: [
		new MakerSquirrel({}),
		new MakerZIP({}, ["darwin"]),
		new MakerRpm({ options: { icon: "build/icon.png" } }),
		new MakerDeb({ options: { icon: "build/icon.png" } }),
		new MakerDMG({ icon: "build/icon.icns" }),
	],
```

- [ ] **Step 5: Confirm `build/` is not gitignored** (`.gitignore` ignores `out/ dist/ .vite/` but not `build/`) so the committed icons ship. Verify: `git check-ignore build/icon.icns` prints nothing.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (forge.config + script type-clean).

---

### Task 5: macOS About panel

**Files:**
- Modify: `src/main/main.ts:101-107` (set About panel options in `whenReady`)

**Interfaces:**
- Consumes: `app` from electron (already imported).

- [ ] **Step 1: Set About panel options** at the start of the `whenReady` callback:

```ts
app.whenReady().then(() => {
	console.log("[beacon] main process ready");
	app.setAboutPanelOptions({
		applicationName: "Beacon",
		applicationVersion: app.getVersion(),
		copyright: "© 2026 Andy Shinn",
		credits: "mDNS / Bonjour / DNS-SD discovery browser",
	});
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 6: Full verification

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all pass (including the new brand + toolbar tests).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Visual smoke**

Run: `pnpm start`
Confirm: title-bar mark+wordmark lockup renders; UI text is Lexend; IP/service-type/hostname cells are JetBrains Mono; window/taskbar shows the Beacon icon; no `/favicon.svg` 404 in devtools. Close the app.

- [ ] **Step 4: Report** the diff summary and the deferred-commit status to the user.

## Self-Review

- **Spec coverage:** Typography → Task 1. Logo (mark+wordmark, vendored SVGs, Toolbar swap, dead-rule removal) → Tasks 2–3. App icon (.icns/.ico/.png, Forge wiring) + favicon → Tasks 2 & 4. About panel → Task 5. Verification/testing → Tasks 3 & 6. All spec sections covered.
- **Placeholders:** The only `<copy …>` markers are in `glyphs.ts` Step 3 — intentional, because the exact path data lives in the vendored SVGs created in Task 2 (DRY; the strings are ~5KB and must not be duplicated into the plan). Every other step has concrete content.
- **Type consistency:** `BeaconMark`/`BeaconWordmark`/`BeaconLockup` names and the `glyphs.ts` constant names (`BEACON_MARK_PATH`, `BEACON_WORDMARK_PATH`) are used consistently across Tasks 2–3.
- **Risk:** Verify the Radix override token names against installed `@radix-ui/themes` (`--default-font-family` confirmed present in styles.css; `--code-font-family` used throughout the app already).
