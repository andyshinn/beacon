// Rewrite `version` and `sha256` in Casks/beacon.rb from a built DMG. Run by
// .github/workflows/homebrew-cask.yml on each stable release, and usable by hand
// against a downloaded release DMG:
//
//   node scripts/update-cask.mjs --version 0.2.0 --dmg path/to/Beacon-0.2.0-universal.dmg
//
// Plain Node ESM, zero dependencies (so CI needs only setup-node, no install).
// Edits ONLY the two anchored lines and fails loudly rather than emit a
// half-updated cask.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CASK = join(REPO_ROOT, "Casks", "beacon.rb");

function fail(message) {
  console.error(`update-cask: ${message}`);
  process.exit(1);
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((res, rej) => {
    createReadStream(path)
      .on("error", rej)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", res);
  });
  return hash.digest("hex");
}

// Replace exactly one occurrence of `<field> "<old>"` at line start, or fail.
function replaceField(source, field, value) {
  const pattern = new RegExp(`^(\\s*${field}\\s+")[^"]*(")`, "m");
  if (!pattern.test(source)) fail(`could not find a \`${field} "..."\` line in the cask`);
  return source.replace(pattern, `$1${value}$2`);
}

const { values } = parseArgs({
  options: {
    version: { type: "string" },
    dmg: { type: "string" },
    cask: { type: "string", default: DEFAULT_CASK },
  },
});

const version = values.version?.replace(/^v/, "");
if (!version) fail("--version is required (e.g. --version 0.2.0)");
if (!values.dmg) fail("--dmg is required (path to the release DMG)");

const dmgPath = resolve(values.dmg);
const caskPath = resolve(values.cask);

const dmgStat = await stat(dmgPath).catch(() => null);
if (!dmgStat?.isFile()) fail(`DMG not found: ${dmgPath}`);

const digest = await sha256(dmgPath);
const original = await readFile(caskPath, "utf8");
let updated = replaceField(original, "version", version);
updated = replaceField(updated, "sha256", digest);

if (updated === original) {
  console.log(`update-cask: no change (already version ${version}, sha256 ${digest})`);
} else {
  await writeFile(caskPath, updated);
  console.log(`update-cask: set version ${version}, sha256 ${digest}`);
}
