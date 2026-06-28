import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";
import { rescan, toggleLive } from "./commands";

const LENS_KEYS: Record<string, Lens> = { "1": "service", "2": "host", "3": "ip", "4": "all" };

export function installKeyboard(): () => void {
	const onKey = (e: KeyboardEvent) => {
		const tag = (e.target as HTMLElement | null)?.tagName;
		const typing = tag === "INPUT" || tag === "TEXTAREA";

		if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
			e.preventDefault();
			document.getElementById("beacon-search")?.focus();
			return;
		}
		if (typing) {
			if (e.key === "Escape") {
				(e.target as HTMLElement).blur();
				if (useDiscoveryStore.getState().query) useDiscoveryStore.getState().clearSearch();
			}
			return;
		}
		if (e.metaKey || e.ctrlKey) {
			if (e.key === "[" || e.key === "ArrowLeft") {
				e.preventDefault();
				window.history.back();
				return;
			}
			if (e.key === "]" || e.key === "ArrowRight") {
				e.preventDefault();
				window.history.forward();
				return;
			}
		}
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		if (e.key === " " || e.key === "p") {
			if (e.key === " " && (tag === "BUTTON" || tag === "A")) return;
			e.preventDefault();
			void toggleLive();
			return;
		}
		if (e.key === "r") void rescan();
		else {
			const lens = LENS_KEYS[e.key];
			if (lens) useSettingsStore.getState().setMode(lens);
		}
	};
	document.addEventListener("keydown", onKey);
	return () => document.removeEventListener("keydown", onKey);
}
