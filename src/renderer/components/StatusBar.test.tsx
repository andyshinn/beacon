// src/renderer/components/StatusBar.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Host, Instance } from "../../shared/types";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import { StatusBar } from "./StatusBar";

const h: Host = {
	id: "mac",
	displayName: "Mac",
	hostname: "Mac.local.",
	addresses: [{ value: "10.0.0.2", family: "ipv4" }],
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};
const i: Instance = {
	key: "k",
	name: "Mac",
	serviceType: "_ssh._tcp",
	protocol: "tcp",
	port: 22,
	txt: {},
	hostId: "mac",
	firstSeen: 0,
	lastSeen: 0,
	present: true,
};

beforeEach(() => {
	useSettingsStore.setState({ showV6: true, showLinkLocal: true, showDesc: true, sortBy: "name" });
	useDiscoveryStore.setState({
		hosts: new Map([["mac", h]]),
		instances: new Map([["k", i]]),
		query: "",
		now: 0,
		pausedAt: 0,
		status: { live: true, scanning: false },
	});
});

describe("StatusBar", () => {
	it("shows Live and the counts while live", () => {
		render(<StatusBar />);
		expect(screen.getByText("Live")).toBeTruthy();
		expect(screen.getByText("1 hosts · 1 service types · 1 instances · 1 addresses")).toBeTruthy();
		expect(screen.getByText("Updated just now")).toBeTruthy();
	});
	it("shows a stale snapshot label when paused beyond the stale threshold", () => {
		useDiscoveryStore.setState({ status: { live: false, scanning: false }, pausedAt: 0, now: 15000 });
		render(<StatusBar />);
		expect(screen.getByText("Snapshot stale · 0:15 old")).toBeTruthy();
	});
});
