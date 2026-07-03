import { describe, expect, it } from "vitest";
import type { Address } from "../src/shared/types";

describe("tooling", () => {
  it("runs vitest and imports shared types", () => {
    const a: Address = { value: "127.0.0.1", family: "loopback" };
    expect(a.family).toBe("loopback");
  });
});
