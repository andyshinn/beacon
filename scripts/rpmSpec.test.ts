import { describe, expect, it } from "vitest";
import { patchRpmSpec } from "./rpmSpec";

describe("patchRpmSpec", () => {
  it("copies the staged app from the absolute BUILD path", () => {
    const patched = patchRpmSpec("%install\nmkdir -p %{buildroot}/usr/\ncp -r usr/* %{buildroot}/usr/\n");
    expect(patched).toContain("cp -r %{_topdir}/BUILD/usr/* %{buildroot}/usr/");
  });

  it("throws when the stock template no longer has the relative copy", () => {
    expect(() => patchRpmSpec("%install\n")).toThrow(/spec template changed/);
  });
});
