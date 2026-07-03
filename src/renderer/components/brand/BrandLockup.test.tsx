import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BeaconLockup } from "./BrandLockup";

describe("BeaconLockup", () => {
	it("exposes the Beacon accessible name", () => {
		render(<BeaconLockup />);
		// getByRole throws if absent, so reaching the assertion already proves it exists
		expect(screen.getByRole("img", { name: "Beacon" })).toBeTruthy();
	});

	it("renders the mark gradient and both glyphs", () => {
		const { container } = render(<BeaconLockup />);
		// the squircle mark carries a gradient; mark + wordmark = two <svg>
		expect(container.querySelector("linearGradient")).toBeTruthy();
		expect(container.querySelectorAll("svg")).toHaveLength(2);
	});
});
