import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// happy-dom does no layout, so the overflow itself (viewport scrollWidth >
// clientWidth) can't be asserted in a unit test. Guard the CSS contract that
// prevents it instead: these rules are easy to delete as "redundant".
const css = (path: string) => readFileSync(new URL(`../src/renderer/${path}`, import.meta.url), "utf8");
const block = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`);
  expect(start, `missing rule: ${selector}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("}", start));
};

describe("vertical-only scroll areas", () => {
  it("pin Radix's content-sized viewport wrapper to the viewport width", () => {
    expect(block(css("styles/tokens.css"), ".bcn-scroll .rt-ScrollAreaViewport > *")).toMatch(/\bwidth:\s*100%;/);
  });

  it("are what the list and detail panes render into", () => {
    for (const file of ["components/ListPane.tsx", "components/DetailPane.tsx"]) {
      expect(css(file)).toMatch(/<ScrollArea className="bcn-scroll"[^>]*scrollbars="vertical"/);
    }
  });

  it("keep indented child rows inside the list width", () => {
    // .childRow also appears in a shared selector list; pick the rule that indents it.
    const rules = css("components/rows/Rows.module.css").match(/^\.childRow \{[^}]*\}/gm) ?? [];
    const rule = rules.find((r) => r.includes("margin-left"));
    const indent = /margin-left:\s*(\d+px);/.exec(rule ?? "")?.[1];
    expect(indent).toBeDefined();
    expect(rule).toContain(`width: calc(100% - ${indent});`);
  });
});
