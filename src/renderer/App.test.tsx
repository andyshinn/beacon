// @vitest-environment happy-dom

import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Host, Instance } from "../shared/types";
import { App } from "./App";
import { useDiscoveryStore } from "./store/discoveryStore";

const h: Host = {
	id: "h1.local.",
	displayName: "h1",
	hostname: "h1.local.",
	addresses: [{ value: "10.0.0.5", family: "ipv4" }],
	firstSeen: 1,
	lastSeen: 1,
	present: true,
};
const i: Instance = {
	key: "a._http._tcp.local.",
	name: "Alpha",
	serviceType: "_http._tcp",
	protocol: "tcp",
	port: 80,
	txt: {},
	hostId: "h1.local.",
	firstSeen: 1,
	lastSeen: 1,
	present: true,
};

beforeEach(() => {
	cleanup();
	useDiscoveryStore.setState({ hosts: new Map(), instances: new Map(), rows: [] });
});

describe("App", () => {
	it("renders the empty state when there are no instances", () => {
		render(
			<Theme>
				<App />
			</Theme>,
		);
		expect(screen.getByText(/Scanning the local network/i)).toBeTruthy();
	});
	it("renders a discovered instance row", () => {
		useDiscoveryStore.getState().applySnapshot({ hosts: [h], instances: [i] });
		render(
			<Theme>
				<App />
			</Theme>,
		);
		expect(screen.getByText("Alpha")).toBeTruthy();
		expect(screen.getByText("_http._tcp")).toBeTruthy();
		expect(screen.getByText("10.0.0.5")).toBeTruthy();
	});
});
