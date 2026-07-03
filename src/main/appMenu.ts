import type { MenuItemConstructorOptions } from "electron";
import type { MenuCommand, ViewMode } from "../shared/ipc";

export interface MenuState {
  live: boolean;
  viewMode: ViewMode;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface MenuBuildDeps {
  platform: NodeJS.Platform;
  appName: string;
  onCommand: (cmd: MenuCommand) => void;
  onBack: () => void;
  onForward: () => void;
}

export function buildMenuTemplate(state: MenuState, deps: MenuBuildDeps): MenuItemConstructorOptions[] {
  const isMac = deps.platform === "darwin";
  const cmd =
    (c: MenuCommand): MenuItemConstructorOptions["click"] =>
    () =>
      deps.onCommand(c);

  const viewItem = (mode: ViewMode, label: string, num: string): MenuItemConstructorOptions => ({
    label,
    type: "radio",
    checked: state.viewMode === mode,
    accelerator: `CommandOrControl+${num}`,
    click: cmd(`view:${mode}`),
  });

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: deps.appName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Open Local Network Settings…", click: cmd("openLocalNetworkSettings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push({
    label: "File",
    submenu: [
      { label: "Export as JSON", click: cmd("export:json") },
      { label: "Export as CSV", click: cmd("export:csv") },
      { label: "Copy as Text", click: cmd("export:txt") },
      ...(isMac ? [] : ([{ type: "separator" }, { role: "quit" }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? ([{ role: "pasteAndMatchStyle" }, { role: "delete" }, { role: "selectAll" }] as MenuItemConstructorOptions[])
        : ([{ role: "delete" }, { type: "separator" }, { role: "selectAll" }] as MenuItemConstructorOptions[])),
      { type: "separator" },
      { label: "Find", accelerator: "CommandOrControl+F", click: cmd("focusSearch") },
    ],
  });

  template.push({
    label: "Discovery",
    submenu: [
      { label: "Rescan", accelerator: "CommandOrControl+R", click: cmd("rescan") },
      {
        label: state.live ? "Pause Discovery" : "Resume Discovery",
        accelerator: "CommandOrControl+.",
        click: cmd("toggleLive"),
      },
    ],
  });

  template.push({
    label: "View",
    submenu: [
      viewItem("service", "Services", "1"),
      viewItem("host", "Hosts", "2"),
      viewItem("ip", "IPs", "3"),
      viewItem("all", "All", "4"),
      { type: "separator" },
      { role: "togglefullscreen" },
      { role: "toggleDevTools" },
    ],
  });

  template.push({
    label: "History",
    submenu: [
      { label: "Back", accelerator: "CommandOrControl+[", enabled: state.canGoBack, click: () => deps.onBack() },
      { label: "Forward", accelerator: "CommandOrControl+]", enabled: state.canGoForward, click: () => deps.onForward() },
    ],
  });

  template.push({ role: "windowMenu" });

  return template;
}
