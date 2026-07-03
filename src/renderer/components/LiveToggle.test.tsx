// @vitest-environment happy-dom

import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDiscoveryStore } from "../store/discoveryStore";
import { LiveToggle } from "./LiveToggle";

beforeEach(() => {
  useDiscoveryStore.setState({ status: { live: true, scanning: false }, now: 0 });
});

function renderToggle() {
  return render(
    <Theme>
      <LiveToggle />
    </Theme>,
  );
}

describe("LiveToggle", () => {
  it("shows Live with no elapsed timer while live", () => {
    renderToggle();
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.queryByText(/\d+:\d{2}/)).toBeNull();
  });
  it("shows Paused with no elapsed timer when not live", () => {
    useDiscoveryStore.setState({ status: { live: false, scanning: false } });
    renderToggle();
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.queryByText(/\d+:\d{2}/)).toBeNull();
  });
});
