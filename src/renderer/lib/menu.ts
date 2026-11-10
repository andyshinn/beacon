import type { MenuCommand, MenuStatePayload, ViewMode } from "../../shared/ipc";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { exportAs, rescan, toggleLive } from "./commands";

export interface MenuBridge {
  onMenuCommand: (listener: (cmd: MenuCommand) => void) => () => void;
  sendMenuState: (state: MenuStatePayload) => void;
}

export interface MenuHandlers {
  rescan: () => unknown;
  toggleLive: () => unknown;
  exportAs: (kind: "json" | "csv" | "txt") => unknown;
  setMode: (mode: ViewMode) => void;
  focusSearch: () => void;
  openLocalNetworkSettings: () => unknown;
}

const VIEW_PREFIX = "view:";

export function dispatchMenuCommand(cmd: MenuCommand, h: MenuHandlers): void {
  if (cmd.startsWith(VIEW_PREFIX)) {
    h.setMode(cmd.slice(VIEW_PREFIX.length) as ViewMode);
    return;
  }
  switch (cmd) {
    case "rescan":
      h.rescan();
      break;
    case "toggleLive":
      h.toggleLive();
      break;
    case "focusSearch":
      h.focusSearch();
      break;
    case "export:json":
      h.exportAs("json");
      break;
    case "export:csv":
      h.exportAs("csv");
      break;
    case "export:txt":
      h.exportAs("txt");
      break;
    case "openLocalNetworkSettings":
      h.openLocalNetworkSettings();
      break;
  }
}

function defaultHandlers(): MenuHandlers {
  return {
    rescan,
    toggleLive,
    exportAs,
    setMode: (mode) => useSettingsStore.getState().setMode(mode),
    focusSearch: () => document.getElementById("beacon-search")?.focus(),
    openLocalNetworkSettings: () => window.beacon.openLocalNetworkSettings(),
  };
}

export function installMenu(bridge: MenuBridge = window.beacon, handlers: MenuHandlers = defaultHandlers()): () => void {
  const unsubCmd = bridge.onMenuCommand((cmd) => dispatchMenuCommand(cmd, handlers));

  let lastSent = "";
  const push = (): void => {
    // Main's menu assumes live until told otherwise; the pre-connect placeholder
    // status would briefly flip it to "Resume Discovery".
    if (!useDiscoveryStore.getState().connected) return;
    const live = useDiscoveryStore.getState().status.live;
    const mode = useSettingsStore.getState().mode;
    const key = `${live}:${mode}`;
    if (key === lastSent) return;
    lastSent = key;
    bridge.sendMenuState({ live, mode });
  };

  push();
  const unsubDisc = useDiscoveryStore.subscribe(push);
  const unsubSet = useSettingsStore.subscribe(push);

  return () => {
    unsubCmd();
    unsubDisc();
    unsubSet();
  };
}
