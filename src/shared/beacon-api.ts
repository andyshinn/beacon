import type { DeltaPayload, HealthPayload, MenuCommand, MenuStatePayload, SnapshotPayload, StatusPayload } from "./ipc";

export type Unsubscribe = () => void;

export interface BeaconApi {
	onSnapshot(listener: (s: SnapshotPayload) => void): Unsubscribe;
	onDelta(listener: (d: DeltaPayload) => void): Unsubscribe;
	onStatus(listener: (s: StatusPayload) => void): Unsubscribe;
	onHealth(listener: (h: HealthPayload) => void): Unsubscribe;
	rescan(): Promise<void>;
	setLive(on: boolean): Promise<void>;
	resolve(key: string): Promise<void>;
	getSnapshot(): Promise<SnapshotPayload>;
	openExternal(url: string): Promise<void>;
	openLocalNetworkSettings(): Promise<void>;
	onMenuCommand(listener: (cmd: MenuCommand) => void): Unsubscribe;
	sendMenuState(state: MenuStatePayload): void;
}
