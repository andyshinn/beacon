import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { FlatRow } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { AllLens } from "./AllLens";

const rows: FlatRow[] = [
  {
    id: "k",
    name: "Mac Studio",
    serviceType: "_ssh._tcp",
    chip: "10.0.0.2",
    port: 22,
    isNew: true,
    isLeft: false,
    selected: false,
  },
];

beforeEach(() => useDiscoveryStore.setState({ selection: null }));

describe("AllLens", () => {
  it("renders name, service type, chip, port, and NEW badge; selects on click", () => {
    render(
      <Theme>
        <AllLens rows={rows} />
      </Theme>,
    );
    expect(screen.getByText("Mac Studio")).toBeTruthy();
    expect(screen.getByText("_ssh._tcp")).toBeTruthy();
    expect(screen.getByText("NEW")).toBeTruthy();
    fireEvent.click(screen.getByText("Mac Studio"));
    expect(useDiscoveryStore.getState().selection).toEqual({ kind: "inst", id: "k" });
  });
});
