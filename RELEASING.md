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
