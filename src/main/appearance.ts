import { APPEARANCES, type Appearance } from "../shared/ipc";

export interface AppearanceIo {
  read(): string | null;
  write(data: string): void;
}

/** The slice of Electron's nativeTheme this module drives. */
export interface NativeThemeLike {
  themeSource: Appearance;
  readonly shouldUseDarkColors: boolean;
}

// Must match --app-bg in src/renderer/styles/tokens.css: the window paints this
// before the renderer's first frame, so a mismatch shows as a flash on launch.
export const WINDOW_BACKGROUND = { dark: "#111113", light: "#fcfcfd" } as const;

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === "string" && (APPEARANCES as readonly string[]).includes(value);
}

// The renderer owns the setting (localStorage), but main can't read that before
// the window exists. Main keeps its own copy so the next launch can theme the
// native chrome and the window background before any renderer code runs.
export function loadAppearance(io: AppearanceIo): Appearance {
  const raw = io.read();
  if (!raw) return "system";
  try {
    const parsed = (JSON.parse(raw) as { appearance?: unknown }).appearance;
    return isAppearance(parsed) ? parsed : "system";
  } catch {
    return "system";
  }
}

/** Applies a renderer-supplied (untrusted) appearance. Returns whether it was accepted. */
export function applyAppearance(value: unknown, nativeTheme: NativeThemeLike, io: AppearanceIo): boolean {
  if (!isAppearance(value)) return false;
  if (nativeTheme.themeSource !== value) nativeTheme.themeSource = value;
  io.write(JSON.stringify({ appearance: value }));
  return true;
}

export function windowBackground(nativeTheme: NativeThemeLike): string {
  return nativeTheme.shouldUseDarkColors ? WINDOW_BACKGROUND.dark : WINDOW_BACKGROUND.light;
}
