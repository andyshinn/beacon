import type { DiscoveryDelta, DiscoveryHealth, DiscoverySnapshot, DiscoveryStatus } from "./types";

export const IPC = {
  snapshot: "discovery:snapshot",
  delta: "discovery:delta",
  status: "discovery:status",
  health: "discovery:health",
  rescan: "command:rescan",
  setLive: "command:setLive",
  resolve: "command:resolve",
  getSnapshot: "command:getSnapshot",
  openExternal: "command:openExternal",
  openLocalNetworkSettings: "command:openLocalNetworkSettings",
  menuCommand: "menu:command",
  menuState: "menu:state",
} as const;

export type SnapshotPayload = DiscoverySnapshot;
export type DeltaPayload = DiscoveryDelta;
export type StatusPayload = DiscoveryStatus;
export type HealthPayload = DiscoveryHealth;

// View modes mirror the renderer's settingsStore `Lens`; kept here so the IPC
// contract (and the main process) can reference them without importing the renderer.
export type ViewMode = "service" | "host" | "ip" | "all";

export type MenuCommand =
  | "rescan"
  | "toggleLive"
  | `view:${ViewMode}`
  | "focusSearch"
  | "export:json"
  | "export:csv"
  | "export:txt"
  | "openLocalNetworkSettings";

export interface MenuStatePayload {
  live: boolean;
  mode: ViewMode;
}
