# AGENTS.md

Guidance for AI coding agents working in this repository.

Beacon is an Electron desktop app for browsing mDNS / Bonjour / DNS-SD services
on the local network. Stack: Electron 42 + Electron Forge (Vite plugin), React 19,
Radix Themes, zustand, `bonjour-service`, TypeScript (strict), Vitest, Biome.

## Commands

Use **pnpm** (v12) and Node 24 (`.nvmrc`). Do not use npm or yarn.

```sh
pnpm install          # install deps (CI uses --frozen-lockfile)
pnpm start            # run the app in dev (opens a GUI window)
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check .
pnpm lint:fix         # biome check --write . (fixes lint + formatting + import order)
pnpm test             # vitest run (all projects)
pnpm vitest run path/to/file.test.ts   # run a single test file
pnpm smoke:discover   # headless CLI discovery against the real network
pnpm make             # build distributables for the host platform (unsigned locally)
```

Before finishing a change, run what CI's `checks` job runs: `pnpm typecheck`,
`pnpm lint`, and `pnpm test`. All three must pass.

## Layout

```
src/shared/     Types and the IPC contract shared by all three processes
src/main/       Electron main process (Node)
  discovery/    Discovery engine: sources → DiscoveryManager → DiscoveryStore
  ipc/          ipcMain wiring between the manager and the window
src/preload/    contextBridge: exposes the typed `window.beacon` API
src/renderer/   React UI
  components/   Components (+ co-located CSS modules), lenses/, rows/, detail/
  lib/          Pure helpers (selectors, export, keyboard, navigation, …)
  store/        zustand stores (discoveryStore, settingsStore)
  styles/       Global tokens and fonts
scripts/        Build/release helpers (icons, cask bump, Mach-O UUID, signing)
tests/          Cross-cutting tests (packaging ignore rules, setup smoke)
Casks/          Homebrew cask, bumped automatically on stable releases
docs/           Design mockups and historical specs/plans (reference only)
```

## Architecture

- **Main owns the data model.** A `DiscoverySource` (`BonjourSource` in the app,
  `FakeSource` in tests) emits raw events; `DiscoveryManager` feeds them into
  `DiscoveryStore` and emits `snapshot` / `delta` / `status` / `health` events.
  The renderer's `discoveryStore` mirrors that state by applying snapshots and deltas.
- **IPC is a typed contract.** Channel names live in `src/shared/ipc.ts`, the
  renderer-facing surface in `src/shared/beacon-api.ts`. Adding a channel means
  touching all of: `shared/ipc.ts`, `shared/beacon-api.ts`, `preload/preload.ts`,
  and the handler in `main/ipc/registerDiscoveryIpc.ts` (or `main/installAppMenu.ts`
  for menu traffic).
- **The renderer is sandboxed** (`contextIsolation`, `sandbox`, no `nodeIntegration`).
  It must never import `electron` or Node built-ins; go through `window.beacon`.
  Validate arguments in `ipcMain` handlers — treat renderer input as untrusted.
- **Keep logic testable.** Main-process modules take their Electron dependencies by
  injection (see `windowState.ts`, `powerEvents.ts`, `autoUpdate.ts`), with a thin
  wiring file (`main.ts`, `installAppMenu.ts`) that is not unit tested. Renderer
  logic lives as pure functions in `renderer/lib/`. Follow the same split.

## Gotchas

- **The main bundle is ESM** (`"type": "module"`, `formats: ["es"]` in
  `vite.main.config.mts`). CommonJS dependencies used by the main process must be
  listed in that file's `external` array rather than bundled, or they fail at
  runtime with `require is not defined`.
- **Externalized deps must also ship in the package.** Forge's Vite plugin strips
  `node_modules` by default; `scripts/packageIgnore.ts` whitelists the runtime
  closure in `RUNTIME_DEPS`. If you add a main-process runtime dependency, or a
  dependency's transitive tree changes, update `RUNTIME_DEPS` (and
  `tests/packageIgnore.test.ts`). A miss does not fail the build — the packaged
  app just silently breaks. `scripts/smoke-package.sh` (macOS, manual) verifies it.
- **pnpm uses a hoisted `node_modules`** (`pnpm-workspace.yaml`); Electron Forge
  requires it. New packages with install scripts need an `allowBuilds` entry there.
- **macOS Local Network permission** is load-bearing: `NSLocalNetworkUsageDescription`,
  the bundle id (`as.andyshinn.beacon`), and the Mach-O UUID stamping hook in
  `forge.config.ts` all exist so macOS grants Beacon its own permission entry.
  Don't change them casually.
- **Signing is opt-in via env vars** (see `RELEASING.md`). Local and fork builds
  must keep working unsigned; never make a build step require a secret.
- **Theme tokens:** `html`/`body` sit outside the Radix `<Theme>` root, so
  `styles/tokens.css` pins literal colors with a `.light` override. Add new bespoke
  surface colors in both places.

## Code style

- Biome handles formatting and linting: 2-space indent, double quotes, 125-column
  lines, organized imports. Run `pnpm lint:fix` rather than formatting by hand.
- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`:
  use `import type` for type-only imports and handle `undefined` from index access.
- Component styles are CSS modules next to the component (`Foo.module.css`).
- Comments explain *why* (constraints, platform quirks), not what the code does.

## Testing

- Tests are co-located as `*.test.ts(x)` beside the code they cover.
- Vitest runs two projects (`vitest.config.ts`): `node` for `src/main`, `src/shared`,
  `scripts`, and `tests`; `renderer` (happy-dom + Testing Library) for `src/renderer`.
- Vitest globals are **not** enabled — import `describe`, `it`, `expect`, `vi` from
  `vitest`.
- Use `FakeSource` and the fixtures in `src/main/discovery/sources/` instead of real
  network access; inject clocks (`now`) rather than relying on real timers.
- New behavior should come with tests; bug fixes should come with a regression test.

## Commits and releases

- Use Conventional Commit subjects (`feat:`, `fix:`, `chore:`, `docs:`, `style:`,
  with an optional scope such as `fix(macos):`).
- Don't bump `version` in `package.json`, edit `Casks/beacon.rb`, or push tags
  unless asked — releases are tag-driven and the cask is bumped by CI. See
  `RELEASING.md`.
- Files under `build/` are generated by `pnpm icons` (requires macOS + Xcode +
  ImageMagick); don't hand-edit them.
