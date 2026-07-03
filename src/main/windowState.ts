import type { BrowserWindow, Rectangle } from "electron";

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
}

export interface WindowStateIo {
  read(): string | null;
  write(data: string): void;
  isOnScreen(rect: Rectangle): boolean;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 720;

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadWindowState(io: WindowStateIo): WindowState {
  const raw = io.read();
  if (!raw) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, isMaximized: false };

  let parsed: Partial<WindowState>;
  try {
    parsed = JSON.parse(raw) as Partial<WindowState>;
  } catch {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, isMaximized: false };
  }

  const width = positive(parsed.width, DEFAULT_WIDTH);
  const height = positive(parsed.height, DEFAULT_HEIGHT);
  const state: WindowState = { width, height, isMaximized: parsed.isMaximized === true };

  if (typeof parsed.x === "number" && typeof parsed.y === "number") {
    const rect = { x: parsed.x, y: parsed.y, width, height };
    if (io.isOnScreen(rect)) {
      state.x = parsed.x;
      state.y = parsed.y;
    }
  }
  return state;
}

export function manageWindow(win: BrowserWindow, io: WindowStateIo): void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = (): void => {
    const maximized = win.isMaximized();
    // While maximized, persist the underlying normal bounds so un-maximize restores correctly.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: maximized,
    };
    io.write(JSON.stringify(state));
  };

  const debouncedSave = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 300);
  };

  win.on("resize", debouncedSave);
  win.on("move", debouncedSave);
  win.on("close", () => {
    if (timer) clearTimeout(timer);
    save();
  });
}
