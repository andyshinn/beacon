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
