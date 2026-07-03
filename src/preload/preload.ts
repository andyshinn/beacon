import type { IpcRendererEvent } from "electron";
import { contextBridge, ipcRenderer } from "electron";
import type { BeaconApi, Unsubscribe } from "../shared/beacon-api";
import type {
  DeltaPayload,
  HealthPayload,
  MenuCommand,
  MenuStatePayload,
  SnapshotPayload,
  StatusPayload,
} from "../shared/ipc";
import { IPC } from "../shared/ipc";

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_e: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const beacon: BeaconApi = {
  onSnapshot: (l) => subscribe<SnapshotPayload>(IPC.snapshot, l),
  onDelta: (l) => subscribe<DeltaPayload>(IPC.delta, l),
  onStatus: (l) => subscribe<StatusPayload>(IPC.status, l),
  onHealth: (l) => subscribe<HealthPayload>(IPC.health, l),
  rescan: () => ipcRenderer.invoke(IPC.rescan) as Promise<void>,
  setLive: (on) => ipcRenderer.invoke(IPC.setLive, on) as Promise<void>,
  resolve: (key) => ipcRenderer.invoke(IPC.resolve, key) as Promise<void>,
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<SnapshotPayload>,
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>,
  openLocalNetworkSettings: () => ipcRenderer.invoke(IPC.openLocalNetworkSettings) as Promise<void>,
  onMenuCommand: (l) => subscribe<MenuCommand>(IPC.menuCommand, l),
  sendMenuState: (state: MenuStatePayload) => ipcRenderer.send(IPC.menuState, state),
};

contextBridge.exposeInMainWorld("beacon", beacon);
