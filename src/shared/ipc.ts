import type { DiscoveryDelta, DiscoverySnapshot, DiscoveryStatus } from "./types";

export const IPC = {
	snapshot: "discovery:snapshot",
	delta: "discovery:delta",
	status: "discovery:status",
	rescan: "command:rescan",
	setLive: "command:setLive",
	resolve: "command:resolve",
	getSnapshot: "command:getSnapshot",
	openExternal: "command:openExternal",
} as const;

export type SnapshotPayload = DiscoverySnapshot;
export type DeltaPayload = DiscoveryDelta;
export type StatusPayload = DiscoveryStatus;
