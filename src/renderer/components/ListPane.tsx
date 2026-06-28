import { IconButton, ScrollArea, Tooltip } from "@radix-ui/themes";
import { useMemo } from "react";
import type { Instance } from "../../shared/types";
import { CollapseAll, ExpandAll } from "../lib/icons";
import {
	buildFlat,
	buildHostTree,
	buildIpGroups,
	buildServiceTree,
	type SelectorCtx,
	visibleInstances,
} from "../lib/selectors";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./ListPane.module.css";
import { AllLens } from "./lenses/AllLens";
import { HostsLens } from "./lenses/HostsLens";
import { IpsLens } from "./lenses/IpsLens";
import { ServicesLens } from "./lenses/ServicesLens";

const TITLE = { service: "Services", host: "Hosts", ip: "Discovered IPs", all: "All Instances" } as const;

function useSelectorCtx(): { ctx: SelectorCtx; visible: Instance[] } {
	const hosts = useDiscoveryStore((s) => s.hosts);
	const instances = useDiscoveryStore((s) => s.instances);
	const query = useDiscoveryStore((s) => s.query);
	const expanded = useDiscoveryStore((s) => s.expanded);
	const selection = useDiscoveryStore((s) => s.selection);
	const now = useDiscoveryStore((s) => s.now);
	const showDesc = useSettingsStore((s) => s.showDesc);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);
	const sortBy = useSettingsStore((s) => s.sortBy);
	const ctx = useMemo<SelectorCtx>(
		() => ({ hosts, settings: { showDesc, showV6, showLinkLocal, sortBy }, query, expanded, selection, now }),
		[hosts, showDesc, showV6, showLinkLocal, sortBy, query, expanded, selection, now],
	);
	const visible = useMemo(() => visibleInstances([...instances.values()], hosts, query), [instances, hosts, query]);
	return { ctx, visible };
}

export function ListPane() {
	const mode = useSettingsStore((s) => s.mode);
	const expandAll = useDiscoveryStore((s) => s.expandAll);
	const collapseAll = useDiscoveryStore((s) => s.collapseAll);
	const { ctx, visible } = useSelectorCtx();

	const serviceGroups = useMemo(() => buildServiceTree(visible, ctx), [visible, ctx]);
	const hostGroups = useMemo(() => buildHostTree(visible, ctx), [visible, ctx]);
	const ipGroups = useMemo(() => buildIpGroups(visible, ctx), [visible, ctx]);
	const flatRows = useMemo(() => buildFlat(visible, ctx), [visible, ctx]);

	const isTree = mode === "service" || mode === "host";
	let count = 0;
	let word = "";
	let body = null;
	if (mode === "service") {
		count = serviceGroups.length;
		word = "service types";
		body = <ServicesLens groups={serviceGroups} />;
	} else if (mode === "host") {
		count = hostGroups.length;
		word = "hosts";
		body = <HostsLens groups={hostGroups} />;
	} else if (mode === "ip") {
		count = ipGroups.reduce((n, g) => n + g.addresses.length, 0);
		word = "addresses";
		body = <IpsLens groups={ipGroups} />;
	} else {
		count = flatRows.length;
		word = "instances";
		body = <AllLens rows={flatRows} />;
	}

	const groupIds = () =>
		mode === "host"
			? [...new Set(visible.map((i) => `host:${i.hostId}`))]
			: [...new Set(visible.map((i) => `svc:${i.serviceType}`))];

	return (
		<>
			<div className={styles.header}>
				<span className={styles.title}>{TITLE[mode]}</span>
				<span className={styles.count}>
					{count} {word}
				</span>
				<span className={styles.spacer} />
				{isTree && (
					<>
						<Tooltip content="Expand all">
							<IconButton variant="ghost" size="1" aria-label="Expand all" onClick={() => expandAll(groupIds())}>
								<ExpandAll />
							</IconButton>
						</Tooltip>
						<Tooltip content="Collapse all">
							<IconButton variant="ghost" size="1" aria-label="Collapse all" onClick={() => collapseAll()}>
								<CollapseAll />
							</IconButton>
						</Tooltip>
					</>
				)}
			</div>
			<ScrollArea className="bcn-scroll" type="hover" scrollbars="vertical" scrollHideDelay={500}>
				<div className="bcn-scroll-content" style={{ padding: "6px 6px 14px" }}>
					{body}
				</div>
			</ScrollArea>
		</>
	);
}
