import { useEffect, useState } from "react";
import type { Appearance } from "../../shared/ipc";
import { useSettingsStore } from "../store/settingsStore";

export type ResolvedAppearance = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveAppearance(appearance: Appearance, systemDark: boolean): ResolvedAppearance {
  if (appearance === "system") return systemDark ? "dark" : "light";
  return appearance;
}

function systemPrefersDark(): boolean {
  // Dark is the fallback where matchMedia is missing: it matches the :root tokens.
  return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY).matches : true;
}

/** The concrete theme to render: the stored choice, with "system" tracking the OS live. */
export function useResolvedAppearance(): ResolvedAppearance {
  const appearance = useSettingsStore((s) => s.appearance);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (): void => setSystemDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return resolveAppearance(appearance, systemDark);
}

export interface AppearanceBridge {
  setAppearance: (appearance: Appearance) => void;
}

/** Mirrors the stored appearance to main (native chrome + next-launch background). */
export function installAppearanceSync(bridge: AppearanceBridge = window.beacon): () => void {
  let lastSent: Appearance | undefined;
  const push = (): void => {
    const { appearance } = useSettingsStore.getState();
    if (appearance === lastSent) return;
    lastSent = appearance;
    bridge.setAppearance(appearance);
  };
  push();
  return useSettingsStore.subscribe(push);
}
