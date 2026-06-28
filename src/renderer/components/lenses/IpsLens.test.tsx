// src/renderer/components/lenses/IpsLens.test.tsx
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpGroup } from "../../lib/selectors";
import { useDiscoveryStore } from "../../store/discoveryStore";
import { IpsLens } from "./IpsLens";

const groups: IpGroup[] = [
	{
		family: "ipv4",
		label: "IPv4",
		count: 1,
		addresses: [{ id: "mac|10.0.0.2", ip: "10.0.0.2", hostName: "Mac", ports: [22, 7000], selected: false }],
	},
];

beforeEach(() => useDiscoveryStore.setState({ selection: null, toast: null }));

describe("IpsLens", () => {
	it("renders the family header, ip, host, and ports", () => {
		render(
			<Theme>
				<IpsLens groups={groups} />
			</Theme>,
		);
		expect(screen.getByText("IPv4")).toBeTruthy();
		expect(screen.getByText("10.0.0.2")).toBeTruthy();
		expect(screen.getByText("Mac")).toBeTruthy();
		expect(screen.getByText("22")).toBeTruthy();
	});
	it("selects the ip on row click and copies on the copy button", () => {
		Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
		render(
			<Theme>
				<IpsLens groups={groups} />
			</Theme>,
		);
		fireEvent.click(screen.getByText("10.0.0.2"));
		expect(useDiscoveryStore.getState().selection).toEqual({ kind: "ip", id: "mac|10.0.0.2" });
		fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("10.0.0.2");
	});
});
