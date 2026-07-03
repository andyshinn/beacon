// src/renderer/components/ListPane.test.tsx
import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { ListPane } from "./ListPane";

const h: Host = {
  id: "mac",
  displayName: "Mac",
  hostname: "Mac.local.",
  addresses: [{ value: "10.0.0.2", family: "ipv4" }],
  firstSeen: 0,
  lastSeen: 0,
  present: true,
};
const i: Instance = {
  key: "k",
  name: "Mac",
  serviceType: "_ssh._tcp",
  protocol: "tcp",
  port: 22,
  txt: {},
  hostId: "mac",
  firstSeen: 0,
  lastSeen: 0,
  present: true,
};

beforeEach(() => {
  useDiscoveryStore.setState({
    hosts: new Map([["mac", h]]),
    instances: new Map([["k", i]]),
    query: "",
    expanded: new Set(),
    selection: null,
    now: 0,
  });
  useSettingsStore.setState({ mode: "service", showDesc: true, showV6: true, showLinkLocal: true, sortBy: "name" });
});

describe("ListPane header", () => {
  it("shows the lens title and count", () => {
    render(
      <Theme>
        <ListPane />
      </Theme>,
    );
    expect(screen.getByText("Services")).toBeTruthy();
    expect(screen.getByText("1 service types")).toBeTruthy();
  });
  it("updates when the lens changes", () => {
    useSettingsStore.setState({ mode: "host" });
    render(
      <Theme>
        <ListPane />
      </Theme>,
    );
    expect(screen.getByText("Hosts")).toBeTruthy();
    expect(screen.getByText("1 hosts")).toBeTruthy();
  });
});
