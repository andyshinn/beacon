# Beacon — Build, Release, Signing & Notarization Design

- **Date:** 2026-07-03
- **Status:** Approved design (pre-implementation)
- **Reference implementation:** `andyshinn/coresense` (Electron Forge + Vite, same author)

## 1. Goal

Make Beacon release-ready by adding, in one pass:

1. A GitHub Actions build + release workflow (test on PR, build artifacts on `main`, draft a GitHub Release on version tags).
2. macOS code signing (Developer ID) **and** notarization (App Store Connect API key).
3. Windows code signing via Azure Trusted Signing.
4. In-app auto-update via `update-electron-app` against the free `update.electronjs.org` feed.
5. A macOS 26 "Liquid Glass" app icon compiled from the Icon Composer bundle (`Assets.car`).

The approach mirrors CoreSense's proven setup, adapted to Beacon's simpler shape: no native modules (bonjour-service is pure JS), no Playwright/e2e, no commercial renderer license.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platforms | macOS + Windows + Linux, all built & released | Full parity; makers already exist |
| macOS signing | Developer ID + notarization (App Store Connect API key) | User is provisioning Apple credentials |
| macOS architecture | **Universal** (x64 + arm64) | No native modules → clean, cheap stitch; matches CoreSense |
| Windows signing | Azure Trusted Signing, **opt-in gated** on `WINDOWS_SIGN` | Ported verbatim from CoreSense; builds stay green while Azure is provisioned |
| Linux | `.deb` + `.rpm`, unsigned, no auto-update | Electron auto-update doesn't cover Linux; expected |
| Auto-update | `update-electron-app` → `update.electronjs.org` | Free feed; requires **public** repo |
| Repo | `andyshinn/beacon`, **public** | Required by `update.electronjs.org` |
| `osxSign` gating | **Opt-in via `APPLE_SIGNING_IDENTITY`** (improvement over CoreSense's always-on) | Keeps `pnpm make` working for contributors with no Developer ID cert |
| Release trigger | Tag `v*.*.*` → **draft** release (prerelease if tag has a hyphen) | Manual publish gate; also gates what `update.electronjs.org` serves |
| Node / pnpm | Node **24 LTS**, pnpm **11** | Conservative LTS; CI-pinned |
| Icon bundle | Rename `logo/icon-macos.icon` → **`logo/beacon.icon`** | `--app-icon beacon` → clean `CFBundleIconName: beacon` |

## 3. Signing philosophy: opt-in everywhere

Signing credentials are **opt-in via environment presence**, so a plain `pnpm make` (single host arch) on any machine still produces a working build with no secrets. Developer ID / notarization / Windows signing activate only when their credentials are present:

- **macOS sign** — a real Developer ID sign when `APPLE_SIGNING_IDENTITY` is set; **otherwise ad-hoc** (`identity: "-"`). macOS signing always runs because a *fully-unsigned* universal (x64+arm64) build cannot be stitched by `@electron/universal` on Apple Silicon hosts/runners (the arm64 slice is auto ad-hoc-signed by the packager and the x64 slice is not, so their file trees differ and the merge aborts). Ad-hoc signing needs no certificate, signs both slices symmetrically, and is transparently upgraded to Developer ID when the identity is present.
- **macOS notarize** — active only when `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` are all set (an ad-hoc build is never notarized).
- **Windows sign** — active when `WINDOWS_SIGN` is set (the `setup-windows-signing` action sets it after provisioning tooling).

## 4. Changes by file

### 4.1 `forge.config.ts`

Add opt-in signing config at the top of the module and wire it into `packagerConfig` and `MakerSquirrel`. Everything currently in the file (Fuses, Vite, AutoUnpackNatives, `packageIgnore`, `NSLocalNetworkUsageDescription`) is preserved.

```ts
import { join } from "node:path";
import { PublisherGitHub } from "@electron-forge/publisher-github"; // NB: capital H in Forge 8

// macOS signing always runs so the universal stitch works on Apple Silicon
// (a fully-unsigned universal build can't be merged there). Real Developer ID
// when APPLE_SIGNING_IDENTITY is set (CI); ad-hoc ("-", no cert) otherwise.
const osxSign = { identity: process.env.APPLE_SIGNING_IDENTITY ?? "-" };

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

// Ship the compiled Liquid Glass asset catalog only on macOS (dead weight elsewhere).
const macIconCatalog = process.platform === "darwin" ? ["build/Assets.car"] : [];
```

`packagerConfig` additions:

```ts
packagerConfig: {
  asar: true,
  icon: "build/icon",
  appBundleId: "com.andyshinn.beacon",
  extraResource: [...macIconCatalog],           // build/Assets.car → Contents/Resources/
  extendInfo: {
    NSLocalNetworkUsageDescription: "…(unchanged)…",
    CFBundleIconName: "beacon",                  // macOS 26 Liquid Glass; matches --app-icon
  },
  osxUniversal: { mergeASARs: true },            // universal x64+arm64 stitch
  osxSign,
  osxNotarize,
  windowsSign,
  ignore: (file: string) => !keepInPackage(file),
},
```

`makers` changes:

```ts
new MakerSquirrel({ setupIcon: "build/icon.ico", windowsSign }),
new MakerZIP({}, ["darwin"]),                    // macOS Squirrel.Mac auto-update feed
new MakerRpm({ options: { icon: "build/icon.png", bin: "Beacon" } }),
new MakerDeb({ options: { icon: "build/icon.png", bin: "Beacon" } }),
new MakerDMG({ icon: "build/icon.icns" }),
```

- `bin: "Beacon"` on deb/rpm matches the actual executable (`executableName` defaults to `productName`); the makers otherwise default `bin` to the lowercased package name (`beacon`) and fail to find the binary. **Verify on the Linux CI build.**

`publishers` (new array — defined for parity + a local `pnpm publish` path; CI still uses `softprops/action-gh-release`):

```ts
publishers: [
  new PublisherGitHub({ repository: { owner: "andyshinn", name: "beacon" }, draft: true }),
],
```

### 4.2 Auto-update — `src/main/autoUpdate.ts` (new) + wire into `main.ts`

New small, testable module matching the codebase's unit style (`installAppMenu`, `registerDiscoveryIpc`, `windowState`):

```ts
import { app } from "electron";
import updateElectronApp from "update-electron-app";

/** Wire in-app auto-update against update.electronjs.org for andyshinn/beacon.
 *  No-ops in dev/unpackaged builds and where the platform/signing can't update. */
export function initAutoUpdate(): void {
  if (!app.isPackaged) return;              // never in dev
  updateElectronApp();                       // reads `repository` from package.json
}
```

Call it once from `app.whenReady()` in `src/main/main.ts` (alongside `setAboutPanelOptions` / `createWindow`).

Notes:
- **Import form (resolved):** `import { updateElectronApp } from "update-electron-app"` — the named ESM import resolves from the CJS module (verified).
- **Externalize + ship (resolved):** `update-electron-app` is CommonJS and `require("electron")`/builtins at load; bundling it into Beacon's ESM main would rewrite those requires to a throwing shim (the same reason `bonjour-service` is external in `vite.main.config.mts`). So it is added to the Vite `external` list and its runtime closure ships unbundled via `keepInPackage`. Closure (verified via `npm ls`): `update-electron-app`, `github-url-to-object`, `is-url`, `ms`.
- macOS auto-update only works with a **signed + notarized** app served as a `.zip` (Squirrel.Mac). Windows uses the Squirrel.Windows `RELEASES`/`.nupkg`. Linux is not covered (expected).

### 4.3 `package.json`

- Add `repository`, `homepage`, `bugs`:
  ```json
  "repository": { "type": "git", "url": "git+https://github.com/andyshinn/beacon.git" },
  "homepage": "https://github.com/andyshinn/beacon#readme",
  "bugs": { "url": "https://github.com/andyshinn/beacon/issues" },
  ```
- Add scripts:
  ```json
  "make:mac": "electron-forge make --platform=darwin --arch=universal",
  "make:win": "electron-forge make --platform=win32 --arch=x64",
  "publish": "electron-forge publish",
  ```
- Add dependency: `update-electron-app` (latest v3).

### 4.4 Icon pipeline — `scripts/generate-icons.ts` + rename bundle

- **Rename** `logo/icon-macos.icon/` → `logo/beacon.icon/` (git mv the folder; Icon Composer reopens it unchanged).
- **Rewrite `generate-icons.ts`** to compile the Liquid Glass icon with `actool` (verified working on this machine against the current bundle: produces `Assets.car` ~1.34 MB, a `<app-icon>.icns`, and a partial plist whose `CFBundleIconName` equals the `--app-icon` value — so `beacon` after the rename):
  ```
  actool logo/beacon.icon --compile <tmp> --app-icon beacon \
    --output-partial-info-plist <tmp>/partial.plist \
    --platform macosx --minimum-deployment-target 11.0
  ```
  then copy `<tmp>/beacon.icns → build/icon.icns` and `<tmp>/Assets.car → build/Assets.car`.
- Keep ImageMagick `magick` → `build/icon.ico` (Windows) and `sips` → `build/icon.png` (Linux), sourced from the bundle's master PNG.
- **Fix the pre-existing master-path bug:** the master is `Assets/Image 2.png` (script currently hardcodes `Image.png`). After the rename the path is `logo/beacon.icon/Assets/Image 2.png`.
- `actool` emits harmless `dyld` symbol warnings on Xcode 26 (exit code 0); ignore them.

**Committed artifacts** (regenerated locally via `pnpm icons`, then committed): `build/icon.icns`, `build/icon.ico`, `build/icon.png`, and the new `build/Assets.car` (~1.3 MB). CI packages the committed `build/` assets — the macOS runner never runs `actool`, keeping releases reproducible.

### 4.5 `.github/workflows/ci.yml` (new)

Single workflow, three jobs. `NODE_VERSION` and `PNPM_VERSION` pinned as workflow-level `env`.

- **Triggers:** `push` to `main` (build artifacts only) and tags `v*.*.*` (→ draft release); `pull_request`; `workflow_dispatch`.
- **Concurrency:** group `ci-${{ github.ref }}`, `cancel-in-progress: ${{ !startsWith(github.ref, 'refs/tags/') }}` (never cancels a tag/release build).
- **Top-level `permissions: contents: read`.**

**Job `checks`** (`ubuntu-latest`): checkout → `pnpm/action-setup@v6` (v11) → `actions/setup-node@v6` (Node 24, `cache: pnpm`) → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm lint` → `pnpm test`. No apt deps (pure JS), no coverage/e2e.

**Job `build`** (`needs: checks`, matrix, `fail-fast: false`):

| os | platform | make script |
|---|---|---|
| `macos-latest` | `darwin` | `pnpm make:mac` (universal) |
| `windows-latest` | `win32` | `pnpm make:win` (x64) |
| `ubuntu-latest` | `linux` | `pnpm make` (installs `rpm` + `fakeroot` via apt first) |

Steps: checkout → (linux) `sudo apt-get install -y rpm fakeroot` → pnpm+node setup → install → **conditional macOS signing** (`if: matrix.platform == 'darwin'`, `uses: ./.github/actions/setup-macos-signing`) → **conditional Windows signing** (`if: matrix.platform == 'win32'`, `uses: ./.github/actions/setup-windows-signing`) → `Make` step running `${{ matrix.make }}` → `actions/upload-artifact@v7` `name: beacon-${{ matrix.platform }}`, `path: out/make/**`, `if-no-files-found: error`.

`Make` step `env` (all from secrets; unset ones just leave signing off):
```
APPLE_SIGNING_IDENTITY, APPLE_API_KEY_ID, APPLE_API_ISSUER,   # APPLE_API_KEY path set by the mac action
AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
```

**Job `release`** (`needs: build`, `if: startsWith(github.ref, 'refs/tags/')`, `permissions: contents: write`):
- `actions/download-artifact@v8` `pattern: beacon-*`, `path: dist-artifacts`.
- `softprops/action-gh-release@v3`:
  ```yaml
  draft: ${{ !contains(github.ref_name, '-') }}
  prerelease: ${{ contains(github.ref_name, '-') }}
  generate_release_notes: true
  files: dist-artifacts/beacon-*/**/*
  fail_on_unmatched_files: true
  ```

### 4.6 Composite actions (ported ~verbatim from CoreSense)

**`.github/actions/setup-macos-signing/action.yml`** — inputs `certificate` (base64 Developer ID `.p12`), `certificate-password`, `api-key` (`.p8` contents). Steps:
1. *Import signing certificate* — decode `.p12`, create an ephemeral keychain in `$RUNNER_TEMP` with a random password, `security import` + `set-key-partition-list` so `codesign` finds the identity, make it the default/searchable keychain, `rm` the `.p12`.
2. *Write notary API key* — write the `.p8` contents to `$RUNNER_TEMP/AuthKey.p8` and export `APPLE_API_KEY=<that path>` into `$GITHUB_ENV` (because `@electron/notarize` reads `APPLE_API_KEY` as a **file path**).

**`.github/actions/setup-windows-signing/action.yml`** — inputs `endpoint`, `account`, `certificate-profile`. `pwsh` step: `nuget install Microsoft.Trusted.Signing.Client -Version 1.0.95`, write `metadata.json` (`Endpoint`/`CodeSigningAccountName`/`CertificateProfileName`), locate newest `signtool.exe` from the Windows SDK, and export `AZURE_TRUSTED_SIGNING_DLIB`, `AZURE_TRUSTED_SIGNING_METADATA`, `SIGNTOOL_PATH`, and `WINDOWS_SIGN=1` into `$GITHUB_ENV`.

Wired in the `build` job:
```yaml
- if: matrix.platform == 'darwin'
  uses: ./.github/actions/setup-macos-signing
  with:
    certificate: ${{ secrets.MACOS_CERTIFICATE }}
    certificate-password: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
    api-key: ${{ secrets.APPLE_API_KEY }}
- if: matrix.platform == 'win32'
  uses: ./.github/actions/setup-windows-signing
  with:
    endpoint: ${{ secrets.AZURE_CODE_SIGNING_ENDPOINT }}
    account: ${{ secrets.AZURE_CODE_SIGNING_ACCOUNT }}
    certificate-profile: ${{ secrets.AZURE_CERT_PROFILE }}
```

### 4.7 `scripts/windows-sign.cjs` (new, ported)

Ported from CoreSense with the display name changed to `Beacon`. Invoked once per binary by the Forge `windowsSign` hook:
```
signtool sign /v /fd sha256 /tr <CODESIGN_TIMESTAMP_URL> /td sha256 \
  /dlib <AZURE_TRUSTED_SIGNING_DLIB> /dmdf <AZURE_TRUSTED_SIGNING_METADATA> \
  /d Beacon <file>
```
Reads `AZURE_TRUSTED_SIGNING_DLIB` (required), `AZURE_TRUSTED_SIGNING_METADATA` (required), `SIGNTOOL_PATH` (default `signtool.exe`), `CODESIGN_TIMESTAMP_URL` (default `http://timestamp.acs.microsoft.com`). Azure auth via `DefaultAzureCredential` reading `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`.

### 4.8 Node/pnpm pinning

- Add `.nvmrc` → `24` (Node 24 LTS).
- CI `env`: `NODE_VERSION: '24'` (setup-node resolves the latest 24.x), `PNPM_VERSION: '11'`.
- No hard `engines` enforcement (avoids install friction). `packageManager` field is optional — left out unless corepack enforcement is wanted later.

## 5. External prerequisites (user-provisioned)

**GitHub repository secrets:**

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

`GITHUB_TOKEN` is the built-in token (no secret to create); the `release` job grants it `contents: write`.

**Other:** create the public `andyshinn/beacon` repo on GitHub and set `git remote origin` (none is configured locally today).

## 6. Release flow (end to end)

1. Bump `version` in `package.json`, commit, `git tag vX.Y.Z`, push the tag.
2. CI: `checks` → `build` (signed/notarized mac universal, signed win, linux) → `release` uploads all artifacts to a **draft** GitHub Release with generated notes.
3. Maintainer reviews and **publishes** the draft.
4. `update.electronjs.org` serves the newly published (non-draft) release; installed apps pick it up via `update-electron-app`.

Prerelease tags (with a hyphen, e.g. `v0.2.0-beta.1`) publish immediately as prereleases and are **not** served to stable auto-update clients.

## 7. Testing & verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test` pass.
- `node --check scripts/windows-sign.cjs`.
- `pnpm icons` regenerates `build/icon.{icns,ico,png}` + `build/Assets.car` cleanly from `logo/beacon.icon`.
- `pnpm make:mac` locally produces an **unsigned** universal `.app` + `.dmg` + `.zip` (proves opt-in gating doesn't break contributor builds); `scripts/smoke-package.sh` still passes and confirms the `.app` contains `Contents/Resources/Assets.car`.
- `actionlint` on `ci.yml` if available; otherwise careful review.
- Full signed/notarized macOS run, Windows Azure signing, and live auto-update can only be verified once the secrets exist and a tag is pushed — called out as a post-merge manual gate.

## 8. Risks / to verify during implementation

- **Forge 8.0.0-alpha.9 compat:** confirm `osxUniversal`, `osxSign`, `osxNotarize`, `windowsSign.hookModulePath`, and `extraResource` are honored by the alpha's bundled `@electron/packager`. (They are standard packager options; low risk but alpha.)
- **Linux `bin` option:** verify `bin: "Beacon"` matches the packaged executable so deb/rpm makers succeed.
- **Universal zip + `update.electronjs.org` arch matching** — confirm the single universal `.zip` satisfies both `arch=arm64` and `arch=x64` update requests.

## 9. Out of scope

- Windows EV/OV cert alternatives (Azure Trusted Signing only).
- Self-hosted update server (public repo → free `update.electronjs.org`).
- Auto version-bump/tagging automation (tagging stays manual).
- Linux auto-update / Snap / Flatpak / AppImage.
- Any renderer/UI changes.
