import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// electron-installer-redhat stages the app at <topdir>/BUILD/usr and its stock spec copies it
// with a relative `cp -r usr/*`. rpm >= 4.20 runs %install from a per-package subdirectory
// (BUILD/<name>-<version>-build), so that relative path no longer exists and rpmbuild fails with
// "cp: cannot stat 'usr/*'". Derive a spec template from the stock one that copies from the
// absolute staging path instead, which works on old and new rpm alike.
const RELATIVE_COPY = " usr/* %{buildroot}/usr/";
const ABSOLUTE_COPY = " %{_topdir}/BUILD/usr/* %{buildroot}/usr/";

export function patchRpmSpec(stockSpec: string): string {
  if (!stockSpec.includes(RELATIVE_COPY)) {
    throw new Error("electron-installer-redhat spec template changed; update scripts/rpmSpec.ts");
  }
  return stockSpec.replace(RELATIVE_COPY, ABSOLUTE_COPY);
}

/** Writes the patched spec template to a temp file and returns its absolute path. */
export function rpmSpecTemplate(): string {
  const require = createRequire(import.meta.url);
  // The package only exports its entry (src/installer.js); resources/ sits beside src/.
  const srcDir = dirname(require.resolve("electron-installer-redhat"));
  const stock = readFileSync(join(srcDir, "..", "resources", "spec.ejs"), "utf8");
  const out = join(mkdtempSync(join(tmpdir(), "beacon-rpm-spec-")), "spec.ejs");
  writeFileSync(out, patchRpmSpec(stock));
  return out;
}
