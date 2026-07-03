import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { keepInPackage } from "./scripts/packageIgnore";

// Ship the compiled Liquid Glass asset catalog only on macOS (dead weight in
// Windows/Linux bundles). Generated from logo/beacon.icon by `pnpm icons`.
const macIconCatalog = process.platform === "darwin" ? ["build/Assets.car"] : [];

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		// electron-packager appends the per-platform extension: build/icon.icns (mac),
		// build/icon.ico (win). Generated from the brand master via `pnpm icons`.
		icon: "build/icon",
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
		// Override the Vite plugin's strip-everything ignore so the externalized bonjour-service
		// closure ships (see scripts/packageIgnore.ts). The plugin respects a user-set function ignore.
		ignore: (file: string) => !keepInPackage(file),
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel({}),
		new MakerZIP({}, ["darwin"]),
		new MakerRpm({ options: { icon: "build/icon.png" } }),
		new MakerDeb({ options: { icon: "build/icon.png" } }),
		new MakerDMG({ icon: "build/icon.icns" }),
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
