import { type PointerEvent as ReactPointerEvent, useRef } from "react";
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

	return (
		// biome-ignore lint/a11y/useSemanticElements: <div> required for setPointerCapture; <hr> cannot receive pointer events
		<div
			className={`${styles.divider} bcn-no-drag`}
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize list pane"
			aria-valuenow={listPaneWidth}
			tabIndex={0}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		/>
	);
}
