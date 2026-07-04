import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// macOS Local Network Privacy keys its permission grant on the main executable's Mach-O
// LC_UUID (Apple TN3179). Electron ships a byte-identical prebuilt main executable, so every
// app on a given Electron version shares one content-hash UUID and macOS collapses their
// Local Network identities together (ours resolved to "Electron / com.github.Electron"). This
// module derives a unique, STABLE per-app UUID and stamps it into the binary at build time.

// Derive a deterministic 16-byte UUID from the app's bundle id. Deterministic (not random) so
// the Local Network grant PERSISTS across releases — a fresh UUID each build would re-prompt on
// every update and litter Settings with stale entries. Unique vs every other app (including
// stock Electron) because it is a hash of the globally-unique bundle id.
export function uuidForBundleId(bundleId: string): Buffer {
  const uuid = createHash("sha256").update(bundleId).digest().subarray(0, 16);
  // RFC-4122 version (5) + variant (10xx) bits. Cosmetic — LNP reads 16 raw bytes — but keeps
  // `dwarfdump --uuid` output a well-formed UUID string.
  uuid[6] = ((uuid[6] ?? 0) & 0x0f) | 0x50;
  uuid[8] = ((uuid[8] ?? 0) & 0x3f) | 0x80;
  return uuid;
}

const MH_MAGIC_64 = 0xfeedfacf; // 64-bit Mach-O, host byte order → little-endian for arm64/x64
const MH_CIGAM_64 = 0xcffaedfe; // 64-bit Mach-O, byte-swapped (big-endian target)
const FAT_MAGIC = 0xcafebabe; // universal wrapper, always big-endian on disk
const FAT_MAGIC_64 = 0xcafebabf; // universal wrapper with 64-bit offsets
const LC_UUID = 0x1b;
const MACH_HEADER_64_SIZE = 32;

// Rewrite the LC_UUID load command in every Mach-O slice of `buf` (in place) to `uuid`.
// Handles a thin 64-bit Mach-O or a fat/universal wrapper of thin slices. Returns the number
// of LC_UUID commands rewritten (0 means the binary had none). Only the 16 uuid bytes change;
// nothing moves, so the code signature can be (re)applied afterward.
export function setMachoUuid(buf: Buffer, uuid: Buffer): number {
  if (uuid.length !== 16) throw new Error(`Replacement UUID must be 16 bytes, got ${uuid.length}`);
  const fatMagic = buf.readUInt32BE(0);
  if (fatMagic === FAT_MAGIC || fatMagic === FAT_MAGIC_64) {
    return patchFatSlices(buf, uuid, fatMagic === FAT_MAGIC_64);
  }
  return patchThinSlice(buf, uuid, 0);
}

function patchThinSlice(buf: Buffer, uuid: Buffer, base: number): number {
  const magic = buf.readUInt32LE(base);
  let littleEndian: boolean;
  if (magic === MH_MAGIC_64) littleEndian = true;
  else if (magic === MH_CIGAM_64) littleEndian = false;
  else throw new Error(`Unsupported Mach-O magic 0x${magic.toString(16)} at offset ${base} (expected 64-bit)`);

  const readU32 = (o: number) => (littleEndian ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ncmds = readU32(base + 16);
  let off = base + MACH_HEADER_64_SIZE;
  let patched = 0;
  for (let i = 0; i < ncmds; i++) {
    const cmd = readU32(off);
    const cmdsize = readU32(off + 4);
    if (cmdsize < 8) throw new Error(`Corrupt load command (cmdsize ${cmdsize}) at offset ${off}`);
    if (cmd === LC_UUID) {
      uuid.copy(buf, off + 8);
      patched++;
    }
    off += cmdsize;
  }
  return patched;
}

function patchFatSlices(buf: Buffer, uuid: Buffer, is64: boolean): number {
  const nArch = buf.readUInt32BE(4);
  let archOff = 8;
  let patched = 0;
  for (let i = 0; i < nArch; i++) {
    // fat_arch: cputype(0) cpusubtype(4) offset(8) size / fat_arch_64 widens offset+size to 64-bit.
    const sliceOffset = is64 ? Number(buf.readBigUInt64BE(archOff + 8)) : buf.readUInt32BE(archOff + 8);
    patched += patchThinSlice(buf, uuid, sliceOffset);
    archOff += is64 ? 32 : 20;
  }
  return patched;
}

// Render 16 UUID bytes as a canonical uppercase UUID string (matches `dwarfdump --uuid`).
export function formatUuid(uuid: Buffer): string {
  const h = uuid.toString("hex").toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Read a Mach-O off disk, rewrite its LC_UUID(s), write it back. Throws if the binary has NO
// LC_UUID command — that would mean shipping without a unique Local Network identity (the bug we
// are fixing), so fail the build loudly rather than regress silently.
export function patchMachoFileUuid(filePath: string, uuid: Buffer): number {
  const buf = fs.readFileSync(filePath);
  const patched = setMachoUuid(buf, uuid);
  if (patched === 0) {
    throw new Error(
      `No LC_UUID load command found in ${filePath} — refusing to ship without a unique Local Network identity`,
    );
  }
  fs.writeFileSync(filePath, buf);
  return patched;
}

// Given a Forge packageAfter* build path (which may point at the bundle root or somewhere inside
// it, e.g. Contents/Resources/app), walk up to the .app bundle and return its sole main
// executable under Contents/MacOS (helpers live under Contents/Frameworks, so there is exactly one).
export function mainExecutablePath(buildPath: string): string {
  let dir = path.resolve(buildPath);
  let appRoot: string | undefined;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "Contents", "MacOS"))) {
      appRoot = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!appRoot) throw new Error(`Could not locate the .app bundle from build path: ${buildPath}`);
  const macosDir = path.join(appRoot, "Contents", "MacOS");
  const entries = fs.readdirSync(macosDir).filter((f) => !f.startsWith("."));
  const [exe] = entries;
  if (entries.length !== 1 || !exe) {
    throw new Error(`Expected exactly one executable in ${macosDir}, found: [${entries.join(", ")}]`);
  }
  return path.join(macosDir, exe);
}

export interface UuidStampResult {
  file: string;
  uuid: string;
  slices: number;
}

// Entry point for the Forge packageAfterCopy hook: locate the app's main executable under
// `buildPath` and stamp it with the deterministic per-app UUID derived from `bundleId`.
export function stampUniqueMachoUuid(buildPath: string, bundleId: string): UuidStampResult {
  const file = mainExecutablePath(buildPath);
  const uuid = uuidForBundleId(bundleId);
  const slices = patchMachoFileUuid(file, uuid);
  return { file, uuid: formatUuid(uuid), slices };
}
