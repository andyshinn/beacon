// src/renderer/components/ViewMenu.test.tsx
// NOTE: Radix DropdownMenu portals its content and happy-dom does not surface
// portalled elements even with async findByText — the trigger button stays
// data-state="closed" regardless of pointer/click events. Per task brief, the
// fallback is to assert via the store after exercising the setter directly.
import { Theme } from "@radix-ui/themes";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import { ViewMenu } from "./ViewMenu";

beforeEach(() => {
	useSettingsStore.setState({ sortBy: "name", showDesc: true, showV6: true, showLinkLocal: true });
});

describe("ViewMenu", () => {
	it("renders the view-options trigger button", () => {
		render(
			<Theme>
				<ViewMenu />
			</Theme>,
		);
		expect(screen.getByRole("button", { name: "View options" })).toBeTruthy();
	});

	it("changes sort via the store setter (portal workaround: happy-dom cannot surface Radix portalled content)", () => {
		render(
			<Theme>
				<ViewMenu />
			</Theme>,
		);
		// Directly exercise the wired store action — the same action the RadioItem fires.
		useSettingsStore.getState().setSortBy("ip");
		expect(useSettingsStore.getState().sortBy).toBe("ip");
	});

	it("toggles showV6 via the store setter (portal workaround)", () => {
		render(
			<Theme>
				<ViewMenu />
			</Theme>,
		);
		useSettingsStore.getState().toggleShowV6();
		expect(useSettingsStore.getState().showV6).toBe(false);
	});
});
