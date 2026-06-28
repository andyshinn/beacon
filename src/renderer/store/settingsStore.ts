import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lens = "service" | "host" | "ip" | "all";
export type SortBy = "name" | "ip" | "lastseen";
export type Appearance = "dark" | "light";

interface SettingsState {
	appearance: Appearance;
	mode: Lens;
	sortBy: SortBy;
	showDesc: boolean;
	showV6: boolean;
	showLinkLocal: boolean;
	setAppearance: (a: Appearance) => void;
	toggleAppearance: () => void;
	setMode: (m: Lens) => void;
	setSortBy: (s: SortBy) => void;
	toggleShowDesc: () => void;
	toggleShowV6: () => void;
	toggleShowLinkLocal: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			appearance: "dark",
			mode: "service",
			sortBy: "name",
			showDesc: true,
			showV6: true,
			showLinkLocal: true,
			setAppearance: (appearance) => set({ appearance }),
			toggleAppearance: () => set((s) => ({ appearance: s.appearance === "dark" ? "light" : "dark" })),
			setMode: (mode) => set({ mode }),
			setSortBy: (sortBy) => set({ sortBy }),
			toggleShowDesc: () => set((s) => ({ showDesc: !s.showDesc })),
			toggleShowV6: () => set((s) => ({ showV6: !s.showV6 })),
			toggleShowLinkLocal: () => set((s) => ({ showLinkLocal: !s.showLinkLocal })),
		}),
		{ name: "beacon.settings", version: 1 },
	),
);
