import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Appearance } from "../../shared/ipc";
import { clampPaneWidth, PANE_DEFAULT } from "../lib/paneWidth";

export type Lens = "service" | "host" | "ip" | "all";
export type SortBy = "name" | "ip" | "lastseen";
export type { Appearance };

interface SettingsState {
  appearance: Appearance;
  mode: Lens;
  sortBy: SortBy;
  showDesc: boolean;
  showV6: boolean;
  showLinkLocal: boolean;
  listPaneWidth: number;
  setAppearance: (a: Appearance) => void;
  setMode: (m: Lens) => void;
  setSortBy: (s: SortBy) => void;
  toggleShowDesc: () => void;
  toggleShowV6: () => void;
  toggleShowLinkLocal: () => void;
  setListPaneWidth: (px: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: "system",
      mode: "service",
      sortBy: "name",
      showDesc: true,
      showV6: true,
      showLinkLocal: true,
      listPaneWidth: PANE_DEFAULT,
      setAppearance: (appearance) => set({ appearance }),
      setMode: (mode) => set({ mode }),
      setSortBy: (sortBy) => set({ sortBy }),
      toggleShowDesc: () => set((s) => ({ showDesc: !s.showDesc })),
      toggleShowV6: () => set((s) => ({ showV6: !s.showV6 })),
      toggleShowLinkLocal: () => set((s) => ({ showLinkLocal: !s.showLinkLocal })),
      setListPaneWidth: (px) => set({ listPaneWidth: clampPaneWidth(px) }),
    }),
    {
      name: "beacon.settings",
      version: 2,
      // v1 -> v2 added "system" as the default. v1 always persisted an explicit
      // "dark" | "light", which passes through untouched so an existing user's
      // look doesn't change on upgrade; only fresh installs follow the OS.
      migrate: (persisted) => persisted as SettingsState,
    },
  ),
);
