// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

describe("icons", () => {
  it("every export renders an <svg>", () => {
    for (const [name, Icon] of Object.entries(icons)) {
      if (typeof Icon !== "function") continue;
      const { container } = render(<Icon />);
      expect(container.querySelector("svg"), name).toBeTruthy();
    }
  });
});
