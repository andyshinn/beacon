# Beacon Build / Release / Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed + notarized cross-platform build/release GitHub Actions pipeline, in-app auto-update, and a macOS 26 Liquid Glass icon to Beacon, porting CoreSense's proven setup.

**Architecture:** One `.github/workflows/ci.yml` (`checks` → `build` matrix → tag-gated draft `release`) plus two composite actions that stage macOS and Windows signing. All signing is opt-in via env presence, so `pnpm make` still produces working unsigned artifacts with no secrets. macOS builds are universal (x64+arm64), signed with Developer ID + notarized via App Store Connect API key; Windows is signed via Azure Trusted Signing; auto-update runs against update.electronjs.org.

**Tech Stack:** Electron Forge 8.0.0-alpha.9, Vite, TypeScript, pnpm 11, Node 24, vitest, GitHub Actions, `actool` (Xcode 26), `update-electron-app` 3.

**Design spec:** [docs/superpowers/specs/2026-07-03-beacon-release-ci-signing-design.md](../specs/2026-07-03-beacon-release-ci-signing-design.md)

## Global Constraints

- **App identity:** `productName` = `Beacon`; `appBundleId` = `com.andyshinn.beacon`; executable = `Beacon`.
- **Repo:** `andyshinn/beacon`, **public** (required by update.electronjs.org).
- **Toolchain (CI):** Node `24`, pnpm `11`; install everywhere is `pnpm install --frozen-lockfile`.
- **Signing is opt-in via env** — never hard-required:
  - macOS sign active only when `APPLE_SIGNING_IDENTITY` is set.
  - macOS notarize active only when `APPLE_API_KEY` **and** `APPLE_API_KEY_ID` **and** `APPLE_API_ISSUER` are all set.
  - Windows sign active only when `WINDOWS_SIGN` is set.
- **macOS arch:** universal (`--arch=universal`), `osxUniversal: { mergeASARs: true }`.
- **Icon:** `actool --app-icon beacon` → `CFBundleIconName: "beacon"`; catalog ships as `Contents/Resources/Assets.car`.
- **`MakerZIP` is darwin-only** (the Squirrel.Mac auto-update feed).
- **Release trigger:** tag `v*.*.*`; `draft` for `vX.Y.Z`, `prerelease` for hyphenated tags (`vX.Y.Z-beta.1`).
- **Preserve existing** `forge.config.ts` behavior: Fuses, Vite plugin entries, `AutoUnpackNativesPlugin`, `keepInPackage` ignore, `NSLocalNetworkUsageDescription`.
- **Secrets (created by the user, not this plan):** `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_SIGNING_IDENTITY`, `AZURE_CODE_SIGNING_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Repo metadata, release scripts, Node pin

**Files:**
- Modify: `package.json` (add `repository`/`homepage`/`bugs`; add `make:mac`/`make:win`/`publish` scripts)
- Create: `.nvmrc`

**Interfaces:**
- Produces: npm scripts `make:mac`, `make:win`, `publish` (consumed by CI in Task 8); `repository` field (consumed by `update-electron-app` in Task 5 and `PublisherGitHub` in Task 3).

- [ ] **Step 1: Add repository metadata to `package.json`**

Insert these three keys immediately after the `"main": ".vite/build/main.js",` line (before `"type": "module"`):

```json
	"repository": {
		"type": "git",
		"url": "git+https://github.com/andyshinn/beacon.git"
	},
	"homepage": "https://github.com/andyshinn/beacon#readme",
	"bugs": {
		"url": "https://github.com/andyshinn/beacon/issues"
	},
```

- [ ] **Step 2: Add release scripts to `package.json`**

In the `"scripts"` block, add these three entries after `"make": "electron-forge make",`:

```json
		"make:mac": "electron-forge make --platform=darwin --arch=universal",
		"make:win": "electron-forge make --platform=win32 --arch=x64",
		"publish": "electron-forge publish",
```

- [ ] **Step 3: Create `.nvmrc`**

```
24
```

- [ ] **Step 4: Verify package.json is valid and fields are present**

Run (python3 avoids `"type": "module"` ambiguity in `node -e`):
```bash
python3 -c "import json; p=json.load(open('package.json')); print(p['repository']['url'],'|',p['scripts']['make:mac'],'|',p['scripts']['publish'])"
cat .nvmrc
```
Expected:
```
git+https://github.com/andyshinn/beacon.git | electron-forge make --platform=darwin --arch=universal | electron-forge publish
24
```

- [ ] **Step 5: Typecheck (unaffected, sanity)**

Run: `pnpm typecheck`
Expected: exits 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json .nvmrc
git commit -m "chore: add release scripts, repo metadata, Node 24 pin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Liquid Glass icon pipeline

Rename the Icon Composer bundle, rewrite `generate-icons.ts` to compile the icon with `actool`, regenerate + commit the build assets, and wire `Assets.car` + `CFBundleIconName` into `forge.config.ts`.

**Files:**
- Rename: `logo/icon-macos.icon/` → `logo/beacon.icon/`
- Modify: `scripts/generate-icons.ts` (full rewrite)
- Modify: `forge.config.ts` (add `macIconCatalog` const, `extraResource`, `CFBundleIconName`)
- Regenerate + commit: `build/icon.icns`, `build/Assets.car`, `build/icon.ico`, `build/icon.png`

**Interfaces:**
- Produces: `build/Assets.car`, `build/icon.icns` (consumed by `forge.config.ts` `extraResource` and `packagerConfig.icon`); `CFBundleIconName: "beacon"` in the packaged `Info.plist`.

- [ ] **Step 1: Rename the icon bundle (preserve git history)**

```bash
git mv "logo/icon-macos.icon" "logo/beacon.icon"
ls "logo/beacon.icon/Assets/"
```
Expected: lists `Image 2.png`.

- [ ] **Step 2: Rewrite `scripts/generate-icons.ts`**

Replace the entire file with:

```ts
/**
 * Generates the packaged-app icons from the Icon Composer bundle
 * (logo/beacon.icon) into build/:
 *   - icon.icns   macOS legacy fallback (Forge packagerConfig.icon -> CFBundleIconFile)
 *   - Assets.car  macOS 26 Liquid Glass catalog (Forge extraResource -> Contents/Resources)
 *   - icon.ico    Windows (Forge packagerConfig.icon)
 *   - icon.png    Linux (maker-deb / maker-rpm options.icon)
 *
 * icns + Assets.car are compiled from the .icon bundle by `actool`; ico + png
 * are rasterized from the bundle's master PNG by ImageMagick / sips.
 *
 * Run with: pnpm icons
 * Requires actool + sips + iconutil (Xcode / macOS) and ImageMagick `magick` on PATH.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconBundle = path.join(root, "logo/beacon.icon");
const master = path.join(iconBundle, "Assets/Image 2.png");
const build = path.join(root, "build");
mkdirSync(build, { recursive: true });

// macOS icns + Liquid Glass Assets.car — actool compiles the .icon bundle.
// --app-icon beacon => output beacon.icns + CFBundleIconName "beacon"
// (must match forge.config.ts extendInfo.CFBundleIconName).
const tmp = path.join(build, ".actool");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
execFileSync(
	"actool",
	[
		iconBundle,
		"--compile",
		tmp,
		"--app-icon",
		"beacon",
		"--output-partial-info-plist",
		path.join(tmp, "partial.plist"),
		"--platform",
		"macosx",
		"--minimum-deployment-target",
		"11.0",
	],
	{ stdio: "ignore" }, // actool prints harmless dyld symbol warnings on Xcode 26
);
copyFileSync(path.join(tmp, "beacon.icns"), path.join(build, "icon.icns"));
copyFileSync(path.join(tmp, "Assets.car"), path.join(build, "Assets.car"));
rmSync(tmp, { recursive: true, force: true });

// Windows .ico — ImageMagick bundles the standard sizes into one file.
execFileSync("magick", [master, "-define", "icon:auto-resize=256,128,64,48,32,16", path.join(build, "icon.ico")]);

// Linux PNG (deb / rpm makers).
execFileSync("sips", ["-z", "512", "512", master, "--out", path.join(build, "icon.png")], { stdio: "ignore" });

console.log("[icons] wrote build/{icon.icns,Assets.car,icon.ico,icon.png}");
```

- [ ] **Step 3: Regenerate the icons**

Run: `pnpm icons`
Expected: prints `[icons] wrote build/{icon.icns,Assets.car,icon.ico,icon.png}`, exits 0.

- [ ] **Step 4: Verify the generated assets**

Run:
```bash
ls -la build/Assets.car build/icon.icns build/icon.ico build/icon.png
file build/Assets.car
```
Expected: `build/Assets.car` exists and is ~1.3 MB; `file` reports it is data (a compiled asset catalog); all four files present.

- [ ] **Step 5: Add the `macIconCatalog` const to `forge.config.ts`**

Immediately after the import block (after line 11, `import { keepInPackage } from "./scripts/packageIgnore";`), insert:

```ts

// Ship the compiled Liquid Glass asset catalog only on macOS (dead weight in
// Windows/Linux bundles). Generated from logo/beacon.icon by `pnpm icons`.
const macIconCatalog = process.platform === "darwin" ? ["build/Assets.car"] : [];
```

- [ ] **Step 6: Wire `extraResource` + `CFBundleIconName` into `packagerConfig`**

In `packagerConfig`, add `extraResource` right after the `appBundleId` line, and add `CFBundleIconName` inside `extendInfo`. The resulting region reads:

```ts
		appBundleId: "com.andyshinn.beacon",
		// build/Assets.car -> Contents/Resources/Assets.car (macOS 26 Liquid Glass).
		extraResource: [...macIconCatalog],
		extendInfo: {
			// macOS Sequoia (15+) gates mDNS behind the Local Network TCC permission, even for
			// a packaged double-clicked .app. This string is shown in the system permission prompt.
			NSLocalNetworkUsageDescription:
				"Beacon scans your local network to discover Bonjour and mDNS services so it can show the devices around you.",
			// macOS 26+ reads the app icon from Assets.car via this name; must match the
			// `actool --app-icon` value used to build build/Assets.car.
			CFBundleIconName: "beacon",
		},
```

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0. If biome flags import ordering, run `pnpm lint:fix` then re-run `pnpm lint`.

- [ ] **Step 8: Package and verify the catalog + icon name ship in the .app**

Run:
```bash
pnpm package
APP="$(/bin/ls -d out/Beacon-darwin-*/Beacon.app | head -1)"
ls "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Print :CFBundleIconName" "$APP/Contents/Info.plist"
```
Expected: `Assets.car` path prints (exists); `CFBundleIconName` prints `beacon`.

- [ ] **Step 9: Commit (bundle rename + script + regenerated assets + forge config)**

```bash
git add "logo/beacon.icon" scripts/generate-icons.ts forge.config.ts build/icon.icns build/Assets.car build/icon.ico build/icon.png
git commit -m "feat(icon): compile Liquid Glass Assets.car via actool

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: forge.config.ts — signing, universal, makers, publisher

Add opt-in macOS/Windows signing, universal stitching, Squirrel setup icon, deb/rpm `bin`, and the GitHub publisher.

**Files:**
- Modify: `forge.config.ts`

**Interfaces:**
- Consumes: `build/icon.ico` (Squirrel `setupIcon`), `build/Assets.car`/`build/icon.icns` (Task 2), `scripts/windows-sign.cjs` (Task 4 — referenced by path, only loaded when `WINDOWS_SIGN` is set).
- Produces: env-gated `osxSign`/`osxNotarize`/`windowsSign`; universal packaging; `publishers` targeting `andyshinn/beacon`.

- [ ] **Step 1: Add imports**

At the top of `forge.config.ts`, add the `node:path` import as the first line and the publisher import alongside the other `@electron-forge` imports:

```ts
import { join } from "node:path";
```
and (with the maker imports) — note the exact export casing `PublisherGitHub` (capital H) in Forge 8:
```ts
import { PublisherGitHub } from "@electron-forge/publisher-github";
```

- [ ] **Step 2: Add the signing consts**

Directly below the `macIconCatalog` const added in Task 2, add:

```ts

// macOS code signing always runs so the universal (x64+arm64) stitch works on
// Apple Silicon hosts/runners — @electron/universal cannot merge a fully-unsigned
// universal app there (the arm64 slice gets auto ad-hoc-signed, the x64 slice does
// not, and their file trees then differ). With APPLE_SIGNING_IDENTITY set (CI) this
// is a real Developer ID sign; otherwise it's ad-hoc ("-"), which needs no
// certificate and keeps `pnpm make:mac` working for contributors and unsigned/fork
// CI builds. Notarization stays separately gated on the API-key vars below.
// NB: `||` not `??` — an absent CI secret is an empty string, not undefined,
// and `"" ?? "-"` would leave identity="" (osx-sign then errors); `"" || "-"`
// correctly falls back to ad-hoc.
const osxSign = { identity: process.env.APPLE_SIGNING_IDENTITY || "-" };

// macOS notarization — opt-in, only when all three App Store Connect API-key
// vars are present. APPLE_API_KEY is a PATH to the .p8 (the CI action writes it).
const osxNotarize =
	process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER
		? {
				appleApiKey: process.env.APPLE_API_KEY,
				appleApiKeyId: process.env.APPLE_API_KEY_ID,
				appleApiIssuer: process.env.APPLE_API_ISSUER,
			}
		: undefined;

// Windows signing — opt-in, only when WINDOWS_SIGN is set (Azure Trusted Signing
// via scripts/windows-sign.cjs). Passed to both packagerConfig and MakerSquirrel.
const windowsSign = process.env.WINDOWS_SIGN
	? { hookModulePath: join(process.cwd(), "scripts", "windows-sign.cjs") }
	: undefined;
```

- [ ] **Step 3: Wire signing + universal into `packagerConfig`**

Add these keys to `packagerConfig`, immediately before the `ignore:` line:

```ts
		// Stitch x64+arm64 into one universal .app; mergeASARs lets the Fuses
		// plugin skip its arch-specific ad-hoc resign so osx-sign signs once.
		osxUniversal: { mergeASARs: true },
		osxSign,
		osxNotarize,
		windowsSign,
```

- [ ] **Step 4: Update makers (Squirrel icon+sign, deb/rpm bin) and add publishers**

Replace the `makers` array with:

```ts
	makers: [
		new MakerSquirrel({ setupIcon: "build/icon.ico", windowsSign }),
		new MakerZIP({}, ["darwin"]),
		new MakerRpm({ options: { icon: "build/icon.png", bin: "Beacon" } }),
		new MakerDeb({ options: { icon: "build/icon.png", bin: "Beacon" } }),
		new MakerDMG({ icon: "build/icon.icns" }),
	],
```

Then add a `publishers` array immediately after the `makers` array (before `plugins`):

```ts
	publishers: [
		// Defined for parity + a local `pnpm publish` path; CI drives releases with
		// softprops/action-gh-release instead.
		new PublisherGitHub({ repository: { owner: "andyshinn", name: "beacon" }, draft: true }),
	],
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both exit 0. If biome flags the new imports' ordering, run `pnpm lint:fix` then re-run `pnpm lint`.

- [ ] **Step 6: Build a universal app with no Apple secrets (proves the ad-hoc fallback stitches)**

With `osxSign` defaulting to ad-hoc, a no-secrets universal build must still succeed (this is the path fork PRs and pre-secrets CI take on Apple Silicon `macos-latest`):
```bash
rm -rf out
env -u APPLE_SIGNING_IDENTITY -u APPLE_API_KEY -u WINDOWS_SIGN pnpm make:mac
lipo -archs "$(/bin/ls -d out/Beacon-darwin-universal/Beacon.app | head -1)/Contents/MacOS/Beacon"
find out/make -name '*.dmg' -o -name '*.zip'
```
Expected: `make:mac` completes; `lipo -archs` prints `x86_64 arm64`; a `.dmg` and a `.zip` exist under `out/make/`.

> **Why ad-hoc:** a *fully-unsigned* universal build cannot be stitched by `@electron/universal` on Apple Silicon (the arm64 slice is auto ad-hoc-signed by the packager, the x64 slice is not, so their file trees differ and the merge aborts). Defaulting `osxSign` to ad-hoc (`identity: "-"`) signs both slices symmetrically with no certificate; a real `APPLE_SIGNING_IDENTITY` transparently upgrades it to Developer ID. Verified locally.

- [ ] **Step 7: Commit**

```bash
git add forge.config.ts
git commit -m "feat(build): opt-in macOS/Windows signing + universal + GitHub publisher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Windows signing hook script

**Files:**
- Create: `scripts/windows-sign.cjs`

**Interfaces:**
- Consumes: env `AZURE_TRUSTED_SIGNING_DLIB`, `AZURE_TRUSTED_SIGNING_METADATA`, `SIGNTOOL_PATH`, `CODESIGN_TIMESTAMP_URL` (set by the Windows composite action, Task 7).
- Produces: a default-exported `async function windowsSign(fileToSign)` referenced by `forge.config.ts` `windowsSign.hookModulePath` (Task 3).

- [ ] **Step 1: Create `scripts/windows-sign.cjs`**

```js
// Windows code-signing hook for @electron/windows-sign, wired in via
// forge.config.ts -> packagerConfig.windowsSign.hookModulePath (only when
// WINDOWS_SIGN=1). Electron Forge calls this once per binary that needs a
// signature: every packaged .exe/.dll/.node, then MakerSquirrel's Setup.exe.
// The hook signs the file IN PLACE and must throw on failure.
//
// This targets Azure Trusted Signing (cloud, CI-friendly — no smart card, no
// GUI). signtool loads the Trusted Signing dlib, which authenticates to Azure
// via the standard env vars (AZURE_TENANT_ID / AZURE_CLIENT_ID /
// AZURE_CLIENT_SECRET) picked up by DefaultAzureCredential, and signs using the
// account + certificate profile described in the metadata JSON. The CI job
// installs the dlib, writes the metadata file, and exports:
//   AZURE_TRUSTED_SIGNING_DLIB     - path to Azure.CodeSigning.Dlib.dll
//   AZURE_TRUSTED_SIGNING_METADATA - path to metadata.json
//   SIGNTOOL_PATH (optional)       - full path to a recent signtool.exe
//   CODESIGN_TIMESTAMP_URL (opt.)  - RFC-3161 timestamp server
// Env is read inside the function so a single hook instance honours per-call env.

const { execFileSync } = require('node:child_process');

module.exports = async function windowsSign(fileToSign) {
  const dlib = process.env.AZURE_TRUSTED_SIGNING_DLIB;
  const metadata = process.env.AZURE_TRUSTED_SIGNING_METADATA;
  const signtool = process.env.SIGNTOOL_PATH || 'signtool.exe';
  const timestampUrl = process.env.CODESIGN_TIMESTAMP_URL || 'http://timestamp.acs.microsoft.com';

  if (!dlib) {
    throw new Error(`AZURE_TRUSTED_SIGNING_DLIB is not set — cannot sign ${fileToSign}`);
  }
  if (!metadata) {
    throw new Error(`AZURE_TRUSTED_SIGNING_METADATA is not set — cannot sign ${fileToSign}`);
  }

  execFileSync(
    signtool,
    [
      'sign',
      '/v',
      '/fd',
      'sha256', // file digest algorithm
      '/tr',
      timestampUrl, // RFC-3161 timestamp server (survives cert expiry)
      '/td',
      'sha256', // timestamp digest algorithm
      '/dlib',
      dlib, // Trusted Signing dlib that performs the cloud sign
      '/dmdf',
      metadata, // JSON: Endpoint, CodeSigningAccountName, CertificateProfileName
      '/d',
      'Beacon', // description shown in the Windows UAC prompt
      fileToSign,
    ],
    { stdio: 'inherit' },
  );
};
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/windows-sign.cjs`
Expected: no output, exits 0.

- [ ] **Step 3: Verify the export shape + guard behavior**

Run:
```bash
node -e "const f=require('./scripts/windows-sign.cjs'); if(typeof f!=='function') throw new Error('not a function'); f('x.exe').catch(e=>{console.log(String(e.message).slice(0,40)); process.exit(0)})"
```
Expected: prints `AZURE_TRUSTED_SIGNING_DLIB is not set — cann` (the guard throws because the env is unset), exits 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/windows-sign.cjs
git commit -m "feat(build): Azure Trusted Signing hook for Windows binaries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Auto-update (DI module + test + main wiring + ship closure)

**Files:**
- Create: `src/main/autoUpdate.ts`
- Test: `src/main/autoUpdate.test.ts`
- Modify: `src/main/main.ts` (import + call in `whenReady`)
- Modify: `package.json` + `pnpm-lock.yaml` (add `update-electron-app`)
- Modify: `vite.main.config.mts` (externalize `update-electron-app`)
- Modify: `scripts/packageIgnore.ts` (ship the closure unbundled)

**Interfaces:**
- Produces: `interface AutoUpdateDeps { isPackaged: boolean; start: () => void; log?: (m: string) => void }` and `function initAutoUpdate(deps: AutoUpdateDeps): boolean` (returns `true` if the updater started, `false` if skipped).
- Consumes: `updateElectronApp` from `update-electron-app` (verified: the named ESM import resolves from the CJS module); `app.isPackaged` from electron (both wired in `main.ts`, not in the tested module).

> **Why externalize + ship:** `update-electron-app` is CommonJS and does `require("electron")`/builtin requires at load. Beacon's ESM main bundle would rewrite those to a throwing shim if it bundled the package (see the comment in `vite.main.config.mts` — the same reason `bonjour-service` is external). So it must be externalized (a plain `import`) and its runtime closure shipped unbundled via `keepInPackage`. Closure verified via `npm ls`: `update-electron-app`, `github-url-to-object`, `is-url`, `ms`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add update-electron-app`
Expected: adds `update-electron-app` (^3.3.0) to `dependencies`; updates `pnpm-lock.yaml`.

- [ ] **Step 2: Externalize it in `vite.main.config.mts`**

Change the `external` line to include `"update-electron-app"` (alongside `bonjour-service`):

```ts
const external = ["electron", "bonjour-service", "update-electron-app", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];
```

- [ ] **Step 3: Ship the closure in `scripts/packageIgnore.ts`**

Add the four closure packages to the end of the `RUNTIME_DEPS` array (after `"@leichtgewicht/ip-codec",`):

```ts
	// update-electron-app auto-update closure. Externalized in vite.main.config.mts
	// (CJS, requires electron/builtins), so it must ship unbundled like bonjour-service.
	"update-electron-app",
	"github-url-to-object",
	"is-url",
	"ms",
```

- [ ] **Step 4: Write the failing test — `src/main/autoUpdate.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { initAutoUpdate } from "./autoUpdate";

describe("initAutoUpdate", () => {
	it("starts the updater when packaged", () => {
		const start = vi.fn();
		const started = initAutoUpdate({ isPackaged: true, start, log: () => {} });
		expect(start).toHaveBeenCalledTimes(1);
		expect(started).toBe(true);
	});

	it("skips the updater when not packaged (dev / electron-forge start)", () => {
		const start = vi.fn();
		const started = initAutoUpdate({ isPackaged: false, start, log: () => {} });
		expect(start).not.toHaveBeenCalled();
		expect(started).toBe(false);
	});
});
```

- [ ] **Step 5: Run the test to confirm it fails**

Run: `pnpm test -- autoUpdate`
Expected: FAIL — cannot resolve `./autoUpdate` (module does not exist yet).

- [ ] **Step 6: Implement `src/main/autoUpdate.ts`**

```ts
/**
 * In-app auto-update wiring. Kept dependency-injected (like installPowerEvents)
 * so the gating logic is unit-testable without electron or update-electron-app.
 * main.ts supplies the real electron `app.isPackaged` and the updateElectronApp
 * call, which reads the repository from package.json and polls update.electronjs.org.
 */
export interface AutoUpdateDeps {
	/** electron app.isPackaged — false under `electron-forge start` and in tests. */
	isPackaged: boolean;
	/** Starts the updater (wraps updateElectronApp()); only invoked when packaged. */
	start: () => void;
	/** Optional log sink; defaults to console.log. */
	log?: (message: string) => void;
}

/**
 * Starts auto-update only for packaged builds. Returns true if the updater was
 * started, false if skipped (dev/unpackaged). Never throws.
 */
export function initAutoUpdate(deps: AutoUpdateDeps): boolean {
	const log = deps.log ?? ((m: string) => console.log(m));
	if (!deps.isPackaged) {
		log("[beacon] auto-update skipped (not packaged)");
		return false;
	}
	deps.start();
	log("[beacon] auto-update started");
	return true;
}
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `pnpm test -- autoUpdate`
Expected: PASS (2 tests).

- [ ] **Step 8: Wire into `src/main/main.ts`**

Add the imports near the other main-process imports (after the `installAppMenu` import, line 5):

```ts
import { updateElectronApp } from "update-electron-app";
import { initAutoUpdate } from "./autoUpdate";
```

Then inside `app.whenReady().then(() => { … })`, add the call immediately after the `app.setAboutPanelOptions({ … });` block and before `createWindow();`:

```ts
	// Auto-update against update.electronjs.org (packaged builds only; no-ops in dev).
	initAutoUpdate({ isPackaged: app.isPackaged, start: () => updateElectronApp() });
```

- [ ] **Step 9: Typecheck + lint + full test run**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck + lint exit 0; all tests pass (including the 2 new autoUpdate tests). If biome flags the new `main.ts` imports' ordering, run `pnpm lint:fix` then re-run `pnpm lint`.

- [ ] **Step 10: Verify the auto-update closure ships in the packaged app.asar**

Run:
```bash
pnpm package
APP="$(/bin/ls -d out/Beacon-darwin-*/Beacon.app | head -1)"
npx --no-install asar list "$APP/Contents/Resources/app.asar" \
  | grep -E "/node_modules/(update-electron-app|github-url-to-object|is-url|ms)/package.json"
```
Expected: matches for all four closure packages (≥4 lines). If any is missing, the externalized `import "update-electron-app"` would fail at runtime — recheck `RUNTIME_DEPS` in Step 3.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml vite.main.config.mts scripts/packageIgnore.ts src/main/autoUpdate.ts src/main/autoUpdate.test.ts src/main/main.ts
git commit -m "feat(update): in-app auto-update via update.electronjs.org

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: macOS signing composite action

**Files:**
- Create: `.github/actions/setup-macos-signing/action.yml`

**Interfaces:**
- Consumes inputs: `certificate` (base64 `.p12`), `certificate-password`, `api-key` (`.p8` contents).
- Produces: an ephemeral keychain holding the Developer ID identity + `APPLE_API_KEY` exported into `$GITHUB_ENV` as the `.p8` file path (consumed by the `build` job's Make step, Task 8).

- [ ] **Step 1: Create `.github/actions/setup-macos-signing/action.yml`**

```yaml
name: Set up macOS signing
description: >-
  Import the Developer ID Application certificate into an ephemeral keychain and
  write the App Store Connect notary API key to a file, then export APPLE_API_KEY
  (its path) so a later electron-forge make step can sign and notarize.

inputs:
  certificate:
    description: Base64-encoded Developer ID Application .p12
    required: true
  certificate-password:
    description: Password for the .p12
    required: true
  api-key:
    description: Contents of the App Store Connect notary API key (.p8)
    required: true

runs:
  using: composite
  steps:
    # Import the Developer ID cert into a throwaway keychain and make it the
    # default + searchable one so codesign can find the identity.
    - name: Import signing certificate
      shell: bash
      env:
        MACOS_CERTIFICATE: ${{ inputs.certificate }}
        MACOS_CERTIFICATE_PASSWORD: ${{ inputs.certificate-password }}
      run: |
        set -euo pipefail
        KEYCHAIN_PATH="$RUNNER_TEMP/build.keychain-db"
        KEYCHAIN_PASSWORD="$(openssl rand -base64 24)"
        CERT_PATH="$RUNNER_TEMP/certificate.p12"
        echo "$MACOS_CERTIFICATE" | base64 --decode > "$CERT_PATH"
        security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
        security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
        security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
        security import "$CERT_PATH" -P "$MACOS_CERTIFICATE_PASSWORD" \
          -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
        security set-key-partition-list -S apple-tool:,apple:,codesign: \
          -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
        security default-keychain -s "$KEYCHAIN_PATH"
        security list-keychains -d user -s "$KEYCHAIN_PATH"
        rm -f "$CERT_PATH"

    # Write the notary API key to a file and export its path; @electron/notarize
    # (via forge.config.ts) reads APPLE_API_KEY as a path, not the key contents.
    - name: Write notary API key
      shell: bash
      env:
        APPLE_API_KEY: ${{ inputs.api-key }}
      run: |
        set -euo pipefail
        KEY_PATH="$RUNNER_TEMP/AuthKey.p8"
        printf '%s' "$APPLE_API_KEY" > "$KEY_PATH"
        echo "APPLE_API_KEY=$KEY_PATH" >> "$GITHUB_ENV"
```

- [ ] **Step 2: Validate the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/actions/setup-macos-signing/action.yml')); print('OK')"`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/actions/setup-macos-signing/action.yml
git commit -m "ci: macOS signing composite action (keychain import + notary key)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Windows signing composite action

**Files:**
- Create: `.github/actions/setup-windows-signing/action.yml`

**Interfaces:**
- Consumes inputs: `endpoint`, `account`, `certificate-profile`.
- Produces: `AZURE_TRUSTED_SIGNING_DLIB`, `AZURE_TRUSTED_SIGNING_METADATA`, `SIGNTOOL_PATH`, `WINDOWS_SIGN=1` exported into `$GITHUB_ENV` (consumed by `forge.config.ts` `windowsSign` gate + `scripts/windows-sign.cjs`).

- [ ] **Step 1: Create `.github/actions/setup-windows-signing/action.yml`**

```yaml
name: Set up Windows Azure Trusted Signing
description: >-
  Install the Azure Trusted Signing dlib, write its metadata, locate a recent
  signtool, and export the env (AZURE_TRUSTED_SIGNING_DLIB/METADATA,
  SIGNTOOL_PATH, WINDOWS_SIGN) the forge windowsSign hook reads at make time.

inputs:
  endpoint:
    description: Trusted Signing account endpoint URI (e.g. https://eus.codesigning.azure.net/)
    required: true
  account:
    description: Trusted Signing account name
    required: true
  certificate-profile:
    description: Trusted Signing certificate profile name
    required: true

runs:
  using: composite
  steps:
    - name: Install Trusted Signing dlib and locate signtool
      shell: pwsh
      env:
        AZURE_CODE_SIGNING_ENDPOINT: ${{ inputs.endpoint }}
        AZURE_CODE_SIGNING_ACCOUNT: ${{ inputs.account }}
        AZURE_CERT_PROFILE: ${{ inputs.certificate-profile }}
      run: |
        $ErrorActionPreference = 'Stop'
        # Trusted Signing client contains Azure.CodeSigning.Dlib.dll
        $client = "$env:RUNNER_TEMP\tsclient"
        nuget install Microsoft.Trusted.Signing.Client -Version 1.0.95 `
          -OutputDirectory $client -ExcludeVersion
        $dlib = Join-Path $client "Microsoft.Trusted.Signing.Client\bin\x64\Azure.CodeSigning.Dlib.dll"
        if (-not (Test-Path $dlib)) { throw "Trusted Signing dlib not found at $dlib" }
        # Metadata describing the signing account + certificate profile
        $metadata = "$env:RUNNER_TEMP\metadata.json"
        @{
          Endpoint = $env:AZURE_CODE_SIGNING_ENDPOINT
          CodeSigningAccountName = $env:AZURE_CODE_SIGNING_ACCOUNT
          CertificateProfileName = $env:AZURE_CERT_PROFILE
        } | ConvertTo-Json | Set-Content -Path $metadata -Encoding utf8
        # Newest signtool from the Windows SDK (>= 10.0.2261.755 required)
        $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" |
          Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
        if (-not $signtool) { throw "signtool.exe not found" }
        # Export for the forge windowsSign hook (scripts/windows-sign.cjs)
        "AZURE_TRUSTED_SIGNING_DLIB=$dlib"         | Out-File $env:GITHUB_ENV -Append -Encoding utf8
        "AZURE_TRUSTED_SIGNING_METADATA=$metadata" | Out-File $env:GITHUB_ENV -Append -Encoding utf8
        "SIGNTOOL_PATH=$signtool"                  | Out-File $env:GITHUB_ENV -Append -Encoding utf8
        "WINDOWS_SIGN=1"                           | Out-File $env:GITHUB_ENV -Append -Encoding utf8
```

- [ ] **Step 2: Validate the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/actions/setup-windows-signing/action.yml')); print('OK')"`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/actions/setup-windows-signing/action.yml
git commit -m "ci: Windows Azure Trusted Signing composite action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm typecheck`/`lint`/`test`, `make:mac`/`make:win`/`make` scripts (Task 1), both composite actions (Tasks 6–7), and the repo secrets (Global Constraints).
- Produces: `beacon-darwin` / `beacon-win32` / `beacon-linux` artifacts and a tag-gated draft GitHub Release.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main] # nightly → build artifacts only
    tags: ['v*.*.*'] # release → draft GitHub release
  pull_request: # test + build every PR
  workflow_dispatch: # manual

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  # never cancel an in-flight tag/release build; do cancel superseded PR/main runs
  cancel-in-progress: ${{ !startsWith(github.ref, 'refs/tags/') }}

env:
  NODE_VERSION: '24'
  PNPM_VERSION: '11'

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test

  build:
    name: Build (${{ matrix.platform }})
    needs: checks
    runs-on: ${{ matrix.os }}
    # Gate the signing setup steps on secret presence (secrets aren't allowed in a
    # step `if`, so map them to job env booleans here). Fork PRs and runs before the
    # secrets are configured then skip signing and still build: macOS falls back to
    # ad-hoc signing (forge.config.ts) and Windows builds unsigned.
    env:
      HAS_APPLE_SIGNING: ${{ secrets.MACOS_CERTIFICATE != '' }}
      HAS_WINDOWS_SIGNING: ${{ secrets.AZURE_CODE_SIGNING_ENDPOINT != '' }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            platform: darwin
            make: pnpm make:mac
          - os: windows-latest
            platform: win32
            make: pnpm make:win
          - os: ubuntu-latest
            platform: linux
            make: pnpm make
    steps:
      - uses: actions/checkout@v7
      - name: Install Linux build deps
        if: matrix.platform == 'linux'
        run: sudo apt-get update && sudo apt-get install -y rpm fakeroot
      - uses: pnpm/action-setup@v6
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v6
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      # macOS code signing + notarization setup (cert import + notary key).
      - name: Set up macOS signing
        if: matrix.platform == 'darwin' && env.HAS_APPLE_SIGNING == 'true'
        uses: ./.github/actions/setup-macos-signing
        with:
          certificate: ${{ secrets.MACOS_CERTIFICATE }}
          certificate-password: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
          api-key: ${{ secrets.APPLE_API_KEY }}

      # Windows Azure Trusted Signing setup (dlib + metadata + signtool).
      - name: Set up Windows signing
        if: matrix.platform == 'win32' && env.HAS_WINDOWS_SIGNING == 'true'
        uses: ./.github/actions/setup-windows-signing
        with:
          endpoint: ${{ secrets.AZURE_CODE_SIGNING_ENDPOINT }}
          account: ${{ secrets.AZURE_CODE_SIGNING_ACCOUNT }}
          certificate-profile: ${{ secrets.AZURE_CERT_PROFILE }}

      - name: Make
        env:
          # macOS signing + notarization (read by forge.config.ts). APPLE_API_KEY
          # (a file path) is exported by the macOS signing action above.
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          # Windows Trusted Signing auth (read by the signtool dlib)
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
        run: ${{ matrix.make }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v7
        with:
          name: beacon-${{ matrix.platform }}
          path: out/make/**
          if-no-files-found: error

  release:
    name: Draft release
    needs: build
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download build artifacts
        uses: actions/download-artifact@v8
        with:
          pattern: beacon-*
          path: dist-artifacts
      - name: Create release
        uses: softprops/action-gh-release@v3
        with:
          draft: ${{ !contains(github.ref_name, '-') }}
          prerelease: ${{ contains(github.ref_name, '-') }}
          generate_release_notes: true
          # Every maker output across the three beacon-<platform> artifacts,
          # including the auto-update set (RELEASES, *.nupkg, *Setup.exe, *.zip).
          files: dist-artifacts/beacon-*/**/*
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Lint the workflow (validates local `uses:` action refs too)**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output, exits 0. (If `actionlint` reports the local composite actions, confirm Tasks 6–7 are committed first.)

- [ ] **Step 3: Structural sanity check**

Run:
```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/ci.yml')); assert set(d['jobs'])=={'checks','build','release'}, d['jobs']; print('jobs OK:', list(d['jobs']))"
```
Expected: prints `jobs OK: ['checks', 'build', 'release']`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build/release workflow with signed cross-platform artifacts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Release documentation

**Files:**
- Create: `RELEASING.md`

**Interfaces:**
- Consumes: nothing at runtime; documents the secrets and flow implemented in Tasks 1–8.

- [ ] **Step 1: Create `RELEASING.md`**

```markdown
# Releasing Beacon

Releases are built and drafted by [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
Pushing a `vX.Y.Z` tag builds signed/notarized macOS (universal), signed Windows,
and Linux artifacts, then drafts a GitHub Release with generated notes.

## Cut a release

1. Bump `version` in `package.json`, commit.
2. Tag and push:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. CI runs `checks` → `build` (3 platforms) → `release`. Review the **draft**
   release, then **publish** it.
4. `update.electronjs.org` serves the published release; installed apps pick it
   up via `update-electron-app`. Draft/unpublished releases are not served.

Prerelease tags contain a hyphen (e.g. `v0.2.0-beta.1`); these publish immediately
as prereleases and are **not** served to stable auto-update clients.

## Signing is opt-in

Local `pnpm make` builds unsigned. Signing activates only when the relevant
credentials are present, so CI signs while contributor/fork builds still succeed:

- **macOS sign** — `APPLE_SIGNING_IDENTITY`
- **macOS notarize** — `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`
- **Windows sign** — `WINDOWS_SIGN` (set by the Windows signing action)

## Required GitHub repository secrets

| Secret | Purpose |
|---|---|
| `MACOS_CERTIFICATE` | base64-encoded Developer ID Application `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` password |
| `APPLE_API_KEY` | contents of the App Store Connect notary `.p8` key |
| `APPLE_API_KEY_ID` | App Store Connect key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer UUID |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Andy Shinn (TEAMID)` |
| `AZURE_CODE_SIGNING_ENDPOINT` | Trusted Signing endpoint URI |
| `AZURE_CODE_SIGNING_ACCOUNT` | Trusted Signing account name |
| `AZURE_CERT_PROFILE` | Trusted Signing certificate profile name |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | service principal (role: *Trusted Signing Certificate Profile Signer*) |

`GITHUB_TOKEN` is built in (the `release` job grants it `contents: write`); no secret to create.

## Regenerating icons

`pnpm icons` recompiles `build/icon.icns` + `build/Assets.car` from
`logo/beacon.icon` via `actool`, and `build/icon.ico` / `build/icon.png` via
ImageMagick / sips. Commit the regenerated `build/` assets. Requires Xcode +
ImageMagick.
```

- [ ] **Step 2: Verify it renders as valid Markdown (no broken tables)**

Run: `python3 -c "s=open('RELEASING.md').read(); assert s.count('|') > 20 and 'update.electronjs.org' in s; print('OK')"`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add RELEASING.md
git commit -m "docs: RELEASING guide (release flow + required secrets)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-implementation manual verification (requires secrets + a tag)

These cannot run locally and are the operator's responsibility after the secrets exist:

- [ ] Push a prerelease tag (e.g. `v0.2.0-test.1`) and confirm the `build` matrix goes green on all three OSes.
- [ ] Confirm the macOS artifact is signed + notarized: download the `.dmg`, `spctl -a -vvv --type install Beacon.app` reports `accepted / Notarized Developer ID`, and `codesign --verify --deep --strict` passes.
- [ ] Confirm the Windows `Setup.exe` is Authenticode-signed (right-click → Properties → Digital Signatures).
- [ ] Publish the draft release and confirm an installed older build auto-updates.
- [ ] Verify the single universal `.zip` satisfies both `arch=arm64` and `arch=x64` update requests (the flagged risk).
