import { join } from "node:path";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGitHub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { stampUniqueMachoUuid } from "./scripts/machoUuid";
import { keepInPackage } from "./scripts/packageIgnore";

// Single source of truth for the bundle id — also the seed for the per-app Mach-O UUID below.
const APP_BUNDLE_ID = "as.andyshinn.beacon";

// Ship the compiled Liquid Glass asset catalog only on macOS (dead weight in
// Windows/Linux bundles). Generated from logo/beacon.icon by `pnpm icons`.
const macIconCatalog = process.platform === "darwin" ? ["build/Assets.car"] : [];

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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // electron-packager appends the per-platform extension: build/icon.icns (mac),
    // build/icon.ico (win). Generated from the brand master via `pnpm icons`.
    icon: "build/icon",
    appBundleId: APP_BUNDLE_ID,
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
    // Stitch x64+arm64 into one universal .app; mergeASARs lets the Fuses
    // plugin skip its arch-specific ad-hoc resign so osx-sign signs once.
    osxUniversal: { mergeASARs: true },
    osxSign: {
      identity: process.env.APPLE_SIGNING_IDENTITY,
    },
    osxNotarize,
    windowsSign,
    // Override the Vite plugin's strip-everything ignore so the externalized bonjour-service
    // closure ships (see scripts/packageIgnore.ts). The plugin respects a user-set function ignore.
    ignore: (file: string) => !keepInPackage(file),
  },
  hooks: {
    // macOS Local Network Privacy keys the permission grant on the main executable's Mach-O
    // LC_UUID, which is byte-identical across every app on a given Electron version (Beacon's
    // collided with "com.github.Electron", so macOS never gave Beacon its own Local Network
    // entry/prompt). Stamp a unique, bundle-id-derived UUID onto each per-arch slice here:
    // packageAfterCopy runs once per arch, BEFORE @electron/universal stitches the slices and
    // BEFORE osx-sign, so the single sign+notarize pass covers the patched bytes. See
    // scripts/machoUuid.ts and docs/superpowers/specs for the full rationale.
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVersion, platform, arch) => {
      if (platform !== "darwin") return;
      const { uuid, slices, file } = stampUniqueMachoUuid(buildPath, APP_BUNDLE_ID);
      console.log(`[beacon] macOS Local Network UUID stamped: ${uuid} (${arch}, ${slices} slice) → ${file}`);
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: "build/icon.ico", windowsSign }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({ options: { icon: "build/icon.png", bin: "Beacon" } }),
    new MakerDeb({ options: { icon: "build/icon.png", bin: "Beacon" } }),
    new MakerDMG({ icon: "build/icon.icns" }),
  ],
  publishers: [
    // Defined for parity + a local `pnpm publish` path; CI drives releases with
    // softprops/action-gh-release instead.
    new PublisherGitHub({ repository: { owner: "andyshinn", name: "beacon" }, draft: true }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: "src/main/main.ts", config: "vite.main.config.mts", target: "main" },
        { entry: "src/preload/preload.ts", config: "vite.preload.config.mts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.mts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
export default config;
