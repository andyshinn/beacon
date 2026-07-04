# Beacon — Homebrew Cask & Tap Design

- **Date:** 2026-07-03
- **Status:** Approved design (pre-implementation)
- **Related:** [`2026-07-03-beacon-release-ci-signing-design.md`](2026-07-03-beacon-release-ci-signing-design.md) (the release flow this hooks into)

## 1. Goal

Let macOS users install Beacon with Homebrew:

```sh
brew tap andyshinn/beacon https://github.com/andyshinn/beacon
brew install --cask beacon
# later
brew upgrade --cask beacon
```

Beacon is a signed, notarized Electron **GUI** app already published to GitHub
Releases, so the correct Homebrew mechanism is a **Cask** (installs a pre-built
`.app` from the DMG), **not** a Formula (which builds CLI tools/libraries from
source). Casks are macOS-only; Windows (Squirrel) and Linux (deb/rpm) keep their
existing installers unchanged.

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mechanism | **Cask** (not Formula) | GUI app; installs the notarized `.app` from the DMG |
| Cask location | **In-repo `Casks/beacon.rb`** | Single repo; no second repo, no cross-repo token |
| Tap command | `brew tap andyshinn/beacon https://github.com/andyshinn/beacon` | Bare `brew tap andyshinn/beacon` (no URL) requires a dedicated `homebrew-beacon` repo, which we opted out of |
| Artifact | `Beacon-<version>-universal.dmg` | The universal DMG from CI's `make:mac --arch=universal` |
| Version/sha upkeep | **CI auto-bump** on stable release | Zero manual work per release; same-repo commit |
| Auto-bump trigger | `on: release → types: [released]` | Fires only for **stable, published** releases; skips drafts + prereleases |
| `auto_updates` | `true` | App self-updates via `update-electron-app` (Squirrel.Mac); the cask must not fight it |
| macOS floor | `depends_on macos: :big_sur` | Electron 42 baseline (symbol form = minimum, per `brew style`) |

### The in-repo tap tradeoff (explicit)

Homebrew resolves the tap name `andyshinn/beacon` to a repo literally named
`homebrew-beacon`. Because we keep the cask **inside the app repo** instead, the
first `brew tap` must name the repo URL once. After that, `brew install --cask
beacon` and `brew upgrade --cask beacon` work normally. This is the accepted
cost of avoiding a second repository.

## 3. The cask — `Casks/beacon.rb`

```ruby
cask "beacon" do
  version "0.1.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/andyshinn/beacon/releases/download/v#{version}/Beacon-#{version}-universal.dmg"
  name "Beacon"
  desc "Browser for mDNS / Bonjour / DNS-SD service discovery"
  homepage "https://github.com/andyshinn/beacon"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :big_sur

  app "Beacon.app"

  zap trash: [
    "~/Library/Application Support/Beacon",
    "~/Library/Caches/com.andyshinn.beacon",
    "~/Library/Caches/com.andyshinn.beacon.ShipIt",
    "~/Library/Preferences/com.andyshinn.beacon.plist",
    "~/Library/Saved Application State/com.andyshinn.beacon.savedState",
  ]
end
```

Notes:

- **`version` / `sha256`** are the two fields the automation rewrites. The
  committed placeholder sha (all-zeros) means the cask will not install until the
  first stable release runs the auto-bump — acceptable, since there is nothing to
  install before a release.
- **No `verified:`** on the URL — `brew audit` flags it as unnecessary because the
  download domain (`github.com`) matches the homepage domain.
- **`auto_updates true`** — Beacon ships `update-electron-app` (Squirrel.Mac),
  so it updates itself; this tells Homebrew not to treat that as drift.
- **`app "Beacon.app"`** — `productName` is `Beacon`, so the mounted DMG contains
  `Beacon.app`.
- **`zap`** removes app support/caches/prefs keyed on bundle id
  `com.andyshinn.beacon` (and the `ShipIt` updater cache) on `brew uninstall --zap`.

## 4. The update script — `scripts/update-cask.mjs`

A small Node script (matches the repo's `tsx`/ESM tooling; no new deps) that
rewrites `version` + `sha256` in `Casks/beacon.rb` in place.

**Interface**

```sh
node scripts/update-cask.mjs --version 0.2.0 --dmg path/to/Beacon-0.2.0-universal.dmg
```

**Behavior**

1. Read `--version` (required) and `--dmg` (required, a local path).
2. Compute the DMG's SHA-256 (`node:crypto`, streamed).
3. Read `Casks/beacon.rb`, replace the `version "…"` and `sha256 "…"` lines via
   anchored regex, write it back.
4. Fail loudly (non-zero exit) if either line isn't found or the DMG is missing —
   never emit a half-updated cask.

This is the single source of truth for the edit, callable both from CI and by
hand against a downloaded release DMG.

## 5. The automation — `.github/workflows/homebrew-cask.yml`

```yaml
name: Homebrew cask
on:
  release:
    types: [released]   # stable published releases only (not draft, not prerelease)
permissions:
  contents: write
```

**Job steps**

1. `actions/checkout` **main** (`ref: main`) with write token.
2. Resolve `VERSION` from the release tag (`${{ github.event.release.tag_name }}`
   with the leading `v` stripped).
3. `gh release download "$TAG" --pattern 'Beacon-*-universal.dmg' --dir dist` to
   fetch the exact published DMG (`GH_TOKEN: ${{ github.token }}`).
4. Set up Node (reuse the repo's Node version), run
   `node scripts/update-cask.mjs --version "$VERSION" --dmg dist/Beacon-*-universal.dmg`.
5. If `Casks/beacon.rb` changed: commit as a bot
   (`github-actions[bot]`) with message `chore: bump homebrew cask to v$VERSION [skip ci]`
   and push to `main`. No-op cleanly if unchanged (re-runs are idempotent).

**Why `types: [released]` and not the tag build:** the tag build drafts the
release, so its DMG URL isn't publicly downloadable and the release could still be
edited. Bumping only after **publish** guarantees the `url` resolves and the
`sha256` matches the final bytes, with no draft-release race.

## 6. Docs

- **README** — add an "Install (macOS)" section with the two-line tap + install.
- **RELEASING.md** — one line noting the cask auto-bumps on publish via
  `homebrew-cask.yml`, and how to bump by hand (`update-cask.mjs`) if ever needed.

## 7. Testing / verification

- `brew style --cask Casks/beacon.rb` (and `brew audit --cask --new` where
  available) pass — cask is syntactically valid Ruby and lints clean.
- `scripts/update-cask.mjs` run against the local `out/make/*.dmg` produces a
  well-formed sha and edits only the two intended lines (verify with `git diff`).
- Workflow YAML parses (`actionlint` if available; otherwise a careful read).

## 8. Out of scope

- A dedicated `homebrew-beacon` tap repo (deferred; would enable the bare
  `brew tap andyshinn/beacon`).
- Submitting Beacon to `homebrew-cask` (homebrew-core) — this is a personal tap.
- Linux/Windows Homebrew (casks are macOS-only).
- Tracking prereleases in the cask.
