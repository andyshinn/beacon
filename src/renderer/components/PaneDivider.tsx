import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { PANE_MAX, PANE_MIN } from "../lib/paneWidth";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./PaneDivider.module.css";

export function PaneDivider() {
  const listPaneWidth = useSettingsStore((s) => s.listPaneWidth);
  const setListPaneWidth = useSettingsStore((s) => s.setListPaneWidth);
  const dragging = useRef(false);
  const bodyLeft = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const body = e.currentTarget.parentElement;
    if (!body) return;
    bodyLeft.current = body.getBoundingClientRect().left;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setListPaneWidth(e.clientX - bodyLeft.current);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setListPaneWidth(listPaneWidth - 16);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setListPaneWidth(listPaneWidth + 16);
    }
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: must be a <div> (not the semantic <hr>) because a void <hr> cannot carry the separator role plus the pointer/keyboard resize handlers this control needs
    <div
      className={`${styles.divider} bcn-no-drag`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize list pane"
      aria-valuemin={PANE_MIN}
      aria-valuemax={PANE_MAX}
      aria-valuenow={listPaneWidth}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
