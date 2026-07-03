export const PANE_MIN = 260;
export const PANE_MAX = 640;
export const PANE_DEFAULT = 384;

export function clampPaneWidth(px: number): number {
  if (!Number.isFinite(px)) return PANE_DEFAULT;
  return Math.min(PANE_MAX, Math.max(PANE_MIN, Math.floor(px)));
}
