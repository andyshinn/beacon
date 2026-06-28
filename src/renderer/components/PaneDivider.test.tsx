// src/renderer/components/PaneDivider.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PANE_DEFAULT, PANE_MAX, PANE_MIN } from "../lib/paneWidth";
import { useSettingsStore } from "../store/settingsStore";
import { PaneDivider } from "./PaneDivider";

beforeEach(() => {
	useSettingsStore.setState({ listPaneWidth: PANE_DEFAULT });
});

describe("PaneDivider", () => {
	it("widens the list pane by 16px on ArrowRight", () => {
		render(
			<div className="bcn-body">
				<PaneDivider />
			</div>,
		);
		fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
		expect(useSettingsStore.getState().listPaneWidth).toBe(PANE_DEFAULT + 16);
	});

	it("narrows the list pane by 16px on ArrowLeft", () => {
		render(
			<div className="bcn-body">
				<PaneDivider />
			</div>,
		);
		fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
		expect(useSettingsStore.getState().listPaneWidth).toBe(PANE_DEFAULT - 16);
	});

	it("clamps to PANE_MAX when arrowing right past the max", () => {
		useSettingsStore.setState({ listPaneWidth: PANE_MAX });
		render(
			<div className="bcn-body">
				<PaneDivider />
			</div>,
		);
		fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowRight" });
		expect(useSettingsStore.getState().listPaneWidth).toBe(PANE_MAX);
	});

	it("clamps to PANE_MIN when arrowing left past the min", () => {
		useSettingsStore.setState({ listPaneWidth: PANE_MIN });
		render(
			<div className="bcn-body">
				<PaneDivider />
			</div>,
		);
		fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
		expect(useSettingsStore.getState().listPaneWidth).toBe(PANE_MIN);
	});
});
