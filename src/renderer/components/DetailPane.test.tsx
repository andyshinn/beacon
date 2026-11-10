// src/renderer/components/DetailPane.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { DetailPane } from "./DetailPane";

const h: Host = {
  id: "mac",
  displayName: "Mac Studio",
  hostname: "Mac.local.",
  addresses: [{ value: "10.0.0.2", family: "ipv4" }],
  firstSeen: 0,
  lastSeen: 0,
  present: true,
};
const web: Instance = {
  key: "web",
  name: "Mac Studio",
  serviceType: "_http._tcp",
  protocol: "tcp",
  port: 80,
  txt: { path: "/" },
  hostId: "mac",
  firstSeen: 0,
  lastSeen: 0,
  present: true,
};

beforeEach(() => {
  window.beacon = {
    openExternal: vi.fn().mockResolvedValue(undefined),
    setLive: vi.fn(),
    rescan: vi.fn(),
    resolve: vi.fn(),
    getSnapshot: vi.fn(),
    onSnapshot: vi.fn(),
    onDelta: vi.fn(),
    onStatus: vi.fn(),
  } as unknown as typeof window.beacon;
  useSettingsStore.setState({ showDesc: true, showV6: true, showLinkLocal: true });
  useDiscoveryStore.setState({
    hosts: new Map([["mac", h]]),
    instances: new Map([["web", web]]),
    query: "",
    now: 0,
    selection: null,
  });
});

describe("DetailPane", () => {
  it("shows the empty state with no selection", () => {
    render(
      <Theme>
        <DetailPane />
      </Theme>,
    );
    expect(screen.getByText("Select an item to see details")).toBeTruthy();
  });
  it("renders an instance detail and opens the browser action", () => {
    useDiscoveryStore.setState({ selection: { kind: "inst", id: "web" } });
    render(
      <Theme>
        <DetailPane />
      </Theme>,
    );
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Service type")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open in Browser" }));
    expect(window.beacon.openExternal).toHaveBeenCalledWith("http://Mac.local:80");
  });
});
