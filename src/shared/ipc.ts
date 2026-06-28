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
} as const;

export type SnapshotPayload = DiscoverySnapshot;
export type DeltaPayload = DiscoveryDelta;
export type StatusPayload = DiscoveryStatus;
export type HealthPayload = DiscoveryHealth;
