#!/usr/bin/env bash
# Packaged-build smoke gate (macOS). Proves the externalized bonjour-service closure ships
# and resolves from a RELOCATED .app (outside the source tree), and that the macOS Local
# Network Info.plist keys are present. This boots a GUI app for ~6s, so it is a local/manual
# gate (not headless CI). See Plan 4, Task 6.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

echo "==> Packaging…"
pnpm package >/dev/null 2>&1 || fail "pnpm package errored"

APP="$(/bin/ls -d "$ROOT"/out/Beacon-darwin-*/Beacon.app 2>/dev/null | head -1)"
[ -n "$APP" ] && [ -d "$APP" ] || fail "no packaged .app under out/"
ASAR="$APP/Contents/Resources/app.asar"
PLIST="$APP/Contents/Info.plist"

echo "==> Asserting the dependency closure shipped into the asar…"
npx --no-install asar list "$ASAR" | grep -q "/node_modules/bonjour-service/package.json" \
	|| fail "bonjour-service missing from app.asar (closure not shipped)"

echo "==> Asserting the macOS Local Network Info.plist keys…"
/usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST" >/dev/null 2>&1 \
	|| fail "NSLocalNetworkUsageDescription missing from Info.plist"
BID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || true)"
[ "$BID" = "as.andyshinn.beacon" ] || fail "CFBundleIdentifier is '$BID', expected as.andyshinn.beacon"

echo "==> Booting a RELOCATED copy (outside the source tree)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$APP" "$TMP/"
LOG="$TMP/boot.log"
( cd "$TMP" && "./Beacon.app/Contents/MacOS/Beacon" >"$LOG" 2>&1 & echo $! >"$TMP/pid" )
sleep 6
kill "$(cat "$TMP/pid")" 2>/dev/null || true
grep -q "\[beacon\] main process ready" "$LOG" \
	|| fail "relocated app did not reach app.whenReady — externalized import likely failed to resolve"

echo "SMOKE PASS: closure ships + resolves from a relocated .app; Info.plist OK."
