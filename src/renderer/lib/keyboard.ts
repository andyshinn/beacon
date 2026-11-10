import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";
import { rescan, toggleLive } from "./commands";

const LENS_KEYS: Record<string, Lens> = { "1": "service", "2": "host", "3": "ip", "4": "all" };

// Controls where printable keys are text entry rather than shortcuts.
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
// Open overlays own the keyboard: Radix menus/listboxes use single keys for typeahead.
const OVERLAY = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';
// Controls that Space activates, including the non-<button> ones (copy spans, pane divider).
const SPACE_ACTIVATED =
  'button, a, summary, [role="button"], [role="separator"], [role="radio"], [role="switch"], [role="checkbox"], [role="tab"]';

function within(target: EventTarget | null, selector: string): boolean {
  // Duck-typed rather than `instanceof Element` so a target from another realm still matches.
  const el = target as Partial<Element> | null;
  return typeof el?.closest === "function" && el.closest(selector) !== null;
}

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    // A focused control that already handled the key (e.g. a copy control on Space) owns it.
    if (e.defaultPrevented) return;
    const typing = within(e.target, TYPING);
    const inOverlay = within(e.target, OVERLAY);

    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !inOverlay)) {
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
    if (inOverlay) return;
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
      if (e.key === " " && within(e.target, SPACE_ACTIVATED)) return;
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
