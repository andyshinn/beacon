// src/renderer/components/lenses/ServicesLens.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TreeGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { ServicesLens } from "./ServicesLens";

const groups: TreeGroup[] = [
  {
    id: "svc:_airplay._tcp",
    title: "_airplay._tcp",
    subtitle: "AirPlay",
    count: 1,
    proto: "TCP",
    chip: null,
    expanded: true,
    selected: false,
    children: [
      {
        id: "k",
        title: "Mac Studio",
        subtitle: "Mac.local.",
        chip: "10.0.0.2",
        port: 7000,
        isNew: false,
        isLeft: false,
        selected: false,
      },
    ],
  },
];

beforeEach(() => useDiscoveryStore.setState({ selection: null, expanded: new Set() }));

describe("ServicesLens", () => {
  it("renders groups + expanded children", () => {
    render(
      <Theme>
        <ServicesLens groups={groups} />
      </Theme>,
    );
    expect(screen.getByText("_airplay._tcp")).toBeTruthy();
    expect(screen.getByText("Mac Studio")).toBeTruthy();
    expect(screen.getByText("TCP")).toBeTruthy();
  });
  it("selects the service type when the group row is clicked", () => {
    render(
      <Theme>
        <ServicesLens groups={groups} />
      </Theme>,
    );
    fireEvent.click(screen.getByText("_airplay._tcp"));
    expect(useDiscoveryStore.getState().selection).toEqual({ kind: "svc", id: "_airplay._tcp" });
  });
  it("selects the instance when a child is clicked", () => {
    render(
      <Theme>
        <ServicesLens groups={groups} />
      </Theme>,
    );
    fireEvent.click(screen.getByText("Mac Studio"));
    expect(useDiscoveryStore.getState().selection).toEqual({ kind: "inst", id: "k" });
  });
});
