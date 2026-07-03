# Beacon Brand Implementation — Design

Date: 2026-06-28
Status: Approved

## Context

Beacon (the mDNS / Bonjour / DNS-SD discovery browser, Electron + React + Radix
Themes) ships with placeholder branding: a CSS-drawn accent square + plain
"Beacon" text in the toolbar, the default Electron app icon, and the Radix/system
default font stack.

A finished brand system now exists in the Claude Design project
`9c99eca3-8764-4ff7-8f9c-27504f987d83` (file `Beacon Brand - Lexend.dc.html`),
with canonical SVG/PNG assets. The user also supplied a modern macOS Icon Composer
bundle at `logo/icon-macos.icon` (1024px master artwork at
`logo/icon-macos.icon/Assets/Image.png`).

This spec applies that brand to the app: typography, the title-bar logo, and the
application/favicon icons.

## Brand facts (from the design project)

- **Typeface:** Lexend (UI), JetBrains Mono (technical/mono labels).
- **Primary accent:** Indigo 600 `#3E63DD` — already the app's Radix `indigo` accent
  (`indigo-9`), so no accent change is required.
- **Mark:** the Lexend "b" with its bowl reimagined as a beacon (bright core).
  Three expressions: app icon (white b + core on indigo gradient squircle),
  mark-on-dark (indigo letter + glowing white core), monochrome (`currentColor`).
- **Wordmark:** "beacon" logotype shipped as vector outlines (`currentColor`,
  default ink `#1C2024`), viewBox `0 0 4799 1000`.
- **Gradient:** `#6E82EE → #3E63DD → #2B46B8` (vertical).
- **Palette (reference only — NOT applied, see decisions):** Canvas `#0B0C10`,
  Surface `#15161B`, Cloud `#EDEEF0`, Ink `#1C2024`.
- Mark min 24px, icon min 16px. Logo ships as outlines, so Lexend is not required
  to render the mark — only for surrounding copy.

## Decisions (locked with user)

1. **Color: minimal — no surface-color change.** Keep the current Radix-slate dark
   surfaces in `tokens.css`. Apply only fonts + logo + icon + the already-indigo
   accent. Light theme untouched. (The brand canvas/surface palette is recorded
   above for reference but intentionally not applied.)
2. **Title-bar logo: mark + wordmark logotype.** The gradient-squircle app-icon
   mark next to the brand "beacon" wordmark outlines, tying the title bar to the
   Dock icon.

## Workstreams

### 1. Typography — Lexend + JetBrains Mono, bundled offline

- Add dev/runtime deps `@fontsource-variable/lexend` and
  `@fontsource-variable/jetbrains-mono`. Variable fonts = one woff2 per family,
  full weight range.
- Vite inlines the imported woff2 into the renderer build output. There is **no
  runtime `node_modules` dependency**, so this is safe under the known
  packaging-dep-closure constraint (the Forge Vite plugin strips `node_modules`;
  bundled renderer assets are unaffected).
- New `src/renderer/styles/fonts.css`:
  - `@import "@fontsource-variable/lexend";`
  - `@import "@fontsource-variable/jetbrains-mono";`
  - Override Radix Themes font tokens so they cascade app-wide:
    - `--default-font-family: "Lexend Variable", -apple-system, system-ui, sans-serif;`
    - `--code-font-family: "JetBrains Mono Variable", ui-monospace, "SF Mono", monospace;`
  - Set on both `:root` and `.radix-themes` to cover html/body (outside `<Theme>`)
    and the Radix root.
- Import `fonts.css` from `main.tsx` (after Radix styles, before/with tokens.css).
- The many existing `var(--code-font-family)` mono cells (IPs, service types,
  hostnames) automatically pick up JetBrains Mono.

*Rationale:* fontsource-variable over manual woff2 vendoring (less to maintain) and
over a Google Fonts CDN link (the app must work offline).

### 2. Logo — title-bar lockup

- Vendor canonical SVGs into `src/renderer/assets/brand/`: `beacon-icon.svg`,
  `beacon-wordmark.svg`, `beacon-mark.svg`, `beacon-mark-on-dark.svg` (latter two
  for reference/future use).
- New brand components in `src/renderer/components/brand/BrandLockup.tsx`
  (inline-SVG React components, matching the existing `lib/icons.tsx` pattern):
  - `BeaconMark({ size }) ` — the gradient-squircle "b" inline SVG. Self-colored
    (own gradient); a unique gradient id avoids collisions. Default 20px.
  - `BeaconWordmark({ height })` — inline SVG with `fill="currentColor"`, so it
    inherits the surrounding text color and adapts to light/dark. Default ~13px.
  - `BeaconLockup` — flex row wrapping mark + wordmark, `role="img"`,
    `aria-label="Beacon"`, `title="mDNS / Bonjour browser"`.
- `Toolbar.tsx`: replace `<div className="bcn-logo" />` + `<span className="bcn-title">Beacon</span>`
  with `<BeaconLockup />`. Keep the `.logoBlock` wrapper for spacing/drag region.
- `tokens.css`: remove the now-dead `.bcn-logo`, `.bcn-logo::after`, `.bcn-title`
  rules.
- Component-scoped styles in `BrandLockup.module.css` (gap, alignment, wordmark
  color via `currentColor` inheriting `--gray-12`).

*Rationale:* inline SVG components (themeable via `currentColor`, no extra
requests, consistent with `lib/icons.tsx`) over `<img src>`.

### 3. App icon + favicon

- **Master:** `logo/icon-macos.icon/Assets/Image.png` (1024, transparent only
  outside the squircle). `beacon-icon.svg` is the vector master for the favicon.
- New `scripts/generate-icons.ts` (run via `pnpm icons`, tsx), emitting committed
  outputs into `build/`:
  - `build/icon.icns` — sips builds an `.iconset` (16/32/64/128/256/512 + @2x),
    `iconutil -c icns`.
  - `build/icon.ico` — `magick` from 16/24/32/48/64/128/256.
  - `build/icon.png` — 512px (Linux makers).
- `forge.config.ts`:
  - `packagerConfig.icon = "build/icon"` (electron-packager appends `.icns`/`.ico`).
  - `MakerDeb`/`MakerRpm` get `options.icon = "build/icon.png"`.
- **Favicon:** copy `beacon-icon.svg` to `src/renderer/assets/brand/favicon.svg`
  and add `<link rel="icon" type="image/svg+xml" href="...">` to `index.html`.
- Add `"icons": "tsx scripts/generate-icons.ts"` to package.json scripts. Commit
  the generated `build/icon.*` so packaging works without a regen step.
- **macOS modern/liquid-glass note:** Electron Forge ships a classic `.icns`. True
  macOS 26 (Tahoe) liquid-glass requires compiling the `.icon` into `Assets.car`
  via `actool` + `CFBundleIconName`, which Forge's packager does not do. The
  provided artwork is already the finished squircle, so the classic `.icns`
  reproduces the intended icon (macOS applies its own mask on 26). Native
  liquid-glass is recorded as an **optional follow-up**, not built here.

### 4. About panel (small touch)

- `src/main/main.ts`: `app.setAboutPanelOptions({ applicationName: "Beacon",
  applicationVersion: app.getVersion(), copyright, credits })` so the macOS About
  box reads correctly alongside the new icns.

## Testing

TDD on the React surface:

- `src/renderer/components/brand/BrandLockup.test.tsx` — renders; exposes the
  "Beacon" accessible name (`role="img"` + `aria-label`); contains the mark and
  wordmark SVGs.
- `src/renderer/components/Toolbar.test.tsx` — update: the "Beacon" accessible name
  now comes from the lockup's `aria-label` rather than text content.

Fonts, color tokens, and generated icons are not unit-tested; verified via build +
visual run.

## Verification

- `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint`.
- `pnpm icons` → assert `build/icon.icns|ico|png` exist and are non-empty.
- `pnpm start` → visually confirm the title-bar lockup, Lexend UI text, and
  JetBrains Mono data cells.

## Out of scope

- No dark/light surface-color retune (per decision 1).
- No changes to LiveToggle pulse motion or other component behavior.
- Native macOS Tahoe liquid-glass icon compilation (optional follow-up).

## Risks / notes

- Confirm Radix font-token override names against the installed
  `@radix-ui/themes` version (`--default-font-family`, `--code-font-family`).
- Keep brand SVG gradient ids unique to avoid collisions when multiple marks
  render on one page.
- The working tree currently has unrelated in-progress menu work; brand changes
  must stay cleanly separable, and git commits are deferred to the user.
