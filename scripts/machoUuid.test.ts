import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatUuid,
  mainExecutablePath,
  patchMachoFileUuid,
  setMachoUuid,
  stampUniqueMachoUuid,
  uuidForBundleId,
} from "./machoUuid";

// --- Mach-O fixture builders (minimal, valid-enough headers to exercise the walker) ---

// A thin 64-bit little-endian Mach-O: header(32) + one non-UUID command(16, to prove it is
// skipped) + optionally an LC_UUID command(24). Trailing bytes stand in for the rest of the
// binary and must survive untouched.
function buildThinMacho(initialUuid: Buffer | null): Buffer {
  const dummy = Buffer.alloc(16);
  dummy.writeUInt32LE(0x25, 0); // some non-UUID load command
  dummy.writeUInt32LE(16, 4); // cmdsize
  dummy.fill(0xaa, 8); // sentinel payload — must not change
  const cmds = [dummy];
  if (initialUuid) {
    const lc = Buffer.alloc(24);
    lc.writeUInt32LE(0x1b, 0); // LC_UUID
    lc.writeUInt32LE(24, 4); // cmdsize
    initialUuid.copy(lc, 8);
    cmds.push(lc);
  }
  const body = Buffer.concat(cmds);
  const header = Buffer.alloc(32);
  header.writeUInt32LE(0xfeedfacf, 0); // MH_MAGIC_64
  header.writeUInt32LE(0x0100000c, 4); // cputype arm64
  header.writeUInt32LE(0, 8); // cpusubtype
  header.writeUInt32LE(2, 12); // MH_EXECUTE
  header.writeUInt32LE(cmds.length, 16); // ncmds
  header.writeUInt32LE(body.length, 20); // sizeofcmds
  return Buffer.concat([header, body, Buffer.from("trailing-binary-content")]);
}

// The LC_UUID's 16 uuid bytes sit at header(32) + dummy cmd(16) + cmd fields(8) = 56.
const UUID_FIELD_OFFSET = 56;

// A fat/universal wrapper (big-endian header) around N thin slices.
function buildFatMacho(slices: Buffer[]): Buffer {
  const headerSize = 8 + slices.length * 20;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(0xcafebabe, 0); // FAT_MAGIC
  header.writeUInt32BE(slices.length, 4);
  const archTable = Buffer.alloc(slices.length * 20);
  const offsets: number[] = [];
  let offset = headerSize;
  slices.forEach((slice, i) => {
    const a = i * 20;
    archTable.writeUInt32BE(0x0100000c, a); // cputype
    archTable.writeUInt32BE(offset, a + 8); // offset
    archTable.writeUInt32BE(slice.length, a + 12); // size
    offsets.push(offset);
    offset += slice.length;
  });
  const buf = Buffer.concat([header, archTable, ...slices]);
  return buf;
}

// The stock Electron 42.5.0 arm64 main-executable UUID that every Electron app of that
// version shares (see docs/superpowers/specs macOS Local Network permission). The whole
// point of the derived UUID is to NOT be this.
const STOCK_ELECTRON_UUID = Buffer.from("4c4c444c55553144a1dcb241098d4b8b", "hex");

describe("uuidForBundleId", () => {
  it("returns 16 bytes", () => {
    expect(uuidForBundleId("as.andyshinn.beacon")).toHaveLength(16);
  });

  it("is deterministic — same bundle id yields the same UUID", () => {
    expect(uuidForBundleId("as.andyshinn.beacon")).toEqual(uuidForBundleId("as.andyshinn.beacon"));
  });

  it("differs for different bundle ids", () => {
    expect(uuidForBundleId("as.andyshinn.beacon")).not.toEqual(uuidForBundleId("com.example.other"));
  });

  it("never collides with the stock Electron UUID", () => {
    expect(uuidForBundleId("as.andyshinn.beacon")).not.toEqual(STOCK_ELECTRON_UUID);
  });

  it("sets RFC-4122 version (5) and variant bits so it is a well-formed UUID", () => {
    const u = uuidForBundleId("as.andyshinn.beacon");
    expect(u.readUInt8(6) & 0xf0).toBe(0x50); // version 5 in the high nibble of byte 6
    expect(u.readUInt8(8) & 0xc0).toBe(0x80); // variant 10xx in the top two bits of byte 8
  });
});

describe("setMachoUuid", () => {
  const NEW = Buffer.alloc(16, 0x22);

  it("rewrites the LC_UUID field of a thin Mach-O and touches nothing else", () => {
    const buf = buildThinMacho(Buffer.alloc(16, 0x11));
    const before = Buffer.from(buf);

    expect(setMachoUuid(buf, NEW)).toBe(1);

    expect(buf.subarray(UUID_FIELD_OFFSET, UUID_FIELD_OFFSET + 16)).toEqual(NEW);
    expect(buf.subarray(0, UUID_FIELD_OFFSET)).toEqual(before.subarray(0, UUID_FIELD_OFFSET));
    expect(buf.subarray(UUID_FIELD_OFFSET + 16)).toEqual(before.subarray(UUID_FIELD_OFFSET + 16));
  });

  it("returns 0 and leaves the buffer untouched when there is no LC_UUID command", () => {
    const buf = buildThinMacho(null);
    const before = Buffer.from(buf);

    expect(setMachoUuid(buf, NEW)).toBe(0);
    expect(buf).toEqual(before);
  });

  it("patches every slice of a fat/universal binary", () => {
    const s1 = buildThinMacho(Buffer.alloc(16, 0x11));
    const s2 = buildThinMacho(Buffer.alloc(16, 0x33));
    const off1 = 8 + 2 * 20;
    const off2 = off1 + s1.length;
    const fat = buildFatMacho([s1, s2]);

    expect(setMachoUuid(fat, NEW)).toBe(2);
    expect(fat.subarray(off1 + UUID_FIELD_OFFSET, off1 + UUID_FIELD_OFFSET + 16)).toEqual(NEW);
    expect(fat.subarray(off2 + UUID_FIELD_OFFSET, off2 + UUID_FIELD_OFFSET + 16)).toEqual(NEW);
  });

  it("throws if the replacement UUID is not 16 bytes", () => {
    expect(() => setMachoUuid(buildThinMacho(Buffer.alloc(16)), Buffer.alloc(8))).toThrow();
  });

  it("throws on an unrecognized (non-64-bit) Mach-O magic", () => {
    const junk = Buffer.alloc(64);
    junk.writeUInt32LE(0xdeadbeef, 0);
    expect(() => setMachoUuid(junk, NEW)).toThrow();
  });
});

describe("formatUuid", () => {
  it("renders 16 bytes as a canonical uppercase UUID string", () => {
    const bytes = Buffer.from("4c4c444c55553144a1dcb241098d4b8b", "hex");
    expect(formatUuid(bytes)).toBe("4C4C444C-5555-3144-A1DC-B241098D4B8B");
  });
});

describe("filesystem helpers", () => {
  const tmpDirs: string[] = [];
  const mkTmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "beacon-macho-"));
    tmpDirs.push(d);
    return d;
  };
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  // Rebuild the same minimal thin Mach-O used above, but as an on-disk file.
  function writeThinMacho(dir: string, initialUuid: Buffer | null, name = "bin"): string {
    const dummy = Buffer.alloc(16);
    dummy.writeUInt32LE(0x25, 0);
    dummy.writeUInt32LE(16, 4);
    const cmds = [dummy];
    if (initialUuid) {
      const lc = Buffer.alloc(24);
      lc.writeUInt32LE(0x1b, 0);
      lc.writeUInt32LE(24, 4);
      initialUuid.copy(lc, 8);
      cmds.push(lc);
    }
    const body = Buffer.concat(cmds);
    const header = Buffer.alloc(32);
    header.writeUInt32LE(0xfeedfacf, 0);
    header.writeUInt32LE(cmds.length, 16);
    header.writeUInt32LE(body.length, 20);
    const file = path.join(dir, name);
    fs.writeFileSync(file, Buffer.concat([header, body]));
    return file;
  }

  it("patchMachoFileUuid writes the patched UUID back to disk", () => {
    const dir = mkTmp();
    const file = writeThinMacho(dir, Buffer.alloc(16, 0x11));
    const uuid = Buffer.alloc(16, 0x22);

    expect(patchMachoFileUuid(file, uuid)).toBe(1);
    expect(fs.readFileSync(file).subarray(56, 72)).toEqual(uuid);
  });

  it("patchMachoFileUuid throws when the binary has no LC_UUID (never ship a broken identity)", () => {
    const dir = mkTmp();
    const file = writeThinMacho(dir, null);
    expect(() => patchMachoFileUuid(file, Buffer.alloc(16, 0x22))).toThrow(/LC_UUID/);
  });

  it("mainExecutablePath resolves the sole Contents/MacOS binary from a resources/app build path", () => {
    const dir = mkTmp();
    const app = path.join(dir, "Beacon.app");
    fs.mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
    fs.mkdirSync(path.join(app, "Contents", "Resources", "app"), { recursive: true });
    const exe = path.join(app, "Contents", "MacOS", "Electron");
    fs.writeFileSync(exe, "x");

    // Forge's packageAfterCopy hands us the resources/app dir; resolver walks up to the bundle.
    expect(mainExecutablePath(path.join(app, "Contents", "Resources", "app"))).toBe(exe);
  });

  it("mainExecutablePath throws if Contents/MacOS is not a single executable", () => {
    const dir = mkTmp();
    const app = path.join(dir, "Beacon.app");
    fs.mkdirSync(path.join(app, "Contents", "MacOS"), { recursive: true });
    fs.writeFileSync(path.join(app, "Contents", "MacOS", "Electron"), "x");
    fs.writeFileSync(path.join(app, "Contents", "MacOS", "Extra"), "y");
    expect(() => mainExecutablePath(app)).toThrow();
  });

  it("stampUniqueMachoUuid stamps the app's main executable with the bundle-id UUID", () => {
    const dir = mkTmp();
    const app = path.join(dir, "Beacon.app");
    const macos = path.join(app, "Contents", "MacOS");
    fs.mkdirSync(macos, { recursive: true });
    // Pre-rename Electron builds still name the main executable "Electron".
    writeThinMacho(macos, Buffer.alloc(16, 0x11), "Electron");

    const result = stampUniqueMachoUuid(app, "as.andyshinn.beacon");

    const expected = uuidForBundleId("as.andyshinn.beacon");
    expect(result.slices).toBe(1);
    expect(result.uuid).toBe(formatUuid(expected));
    expect(result.file).toBe(path.join(macos, "Electron"));
    expect(fs.readFileSync(path.join(macos, "Electron")).subarray(56, 72)).toEqual(expected);
  });
});
