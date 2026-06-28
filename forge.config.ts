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

const config: ForgeConfig = {
	packagerConfig: {
		asar: true,
		appBundleId: "com.andyshinn.beacon",
		extendInfo: {
			// macOS Sequoia (15+) gates mDNS behind the Local Network TCC permission, even for
			// a packaged double-clicked .app. This string is shown in the system permission prompt.
			NSLocalNetworkUsageDescription:
				"Beacon scans your local network to discover Bonjour and mDNS services so it can show the devices around you.",
		},
		// Override the Vite plugin's strip-everything ignore so the externalized bonjour-service
		// closure ships (see scripts/packageIgnore.ts). The plugin respects a user-set function ignore.
		ignore: (file: string) => !keepInPackage(file),
	},
	rebuildConfig: {},
	makers: [new MakerSquirrel({}), new MakerZIP({}, ["darwin"]), new MakerRpm({}), new MakerDeb({}), new MakerDMG({})],
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
