import { useMemo } from "react";
import { ageLabel, staleness } from "../lib/presence";
import { lensCounts, visibleInstances } from "../lib/selectors";
import { useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
	const hosts = useDiscoveryStore((s) => s.hosts);
	const instances = useDiscoveryStore((s) => s.instances);
	const query = useDiscoveryStore((s) => s.query);
	const status = useDiscoveryStore((s) => s.status);
	const now = useDiscoveryStore((s) => s.now);
	const pausedAt = useDiscoveryStore((s) => s.pausedAt);
	const showV6 = useSettingsStore((s) => s.showV6);
	const showLinkLocal = useSettingsStore((s) => s.showLinkLocal);

	const counts = useMemo(() => {
		const visible = visibleInstances([...instances.values()], hosts, query);
		return lensCounts(visible, {
			hosts,
			settings: { showDesc: true, showV6, showLinkLocal, sortBy: "name" },
			query,
			expanded: new Set(),
			selection: null,
			now,
		});
	}, [instances, hosts, query, showV6, showLinkLocal, now]);

	const pausedAgeS = status.live ? 0 : Math.floor((now - pausedAt) / 1000);
	const stale = staleness(status.live, pausedAgeS);
	const dotClass = status.live ? styles.dotLive : stale === "stale" ? styles.dotStale : styles.dotPaused;
	const label = status.live ? "Live" : "Paused";
	const updated = status.live
		? "Updated just now"
		: stale === "stale"
			? `Snapshot stale · ${ageLabel(pausedAgeS)} old`
			: `Paused · ${ageLabel(pausedAgeS)}`;

	return (
		<>
			<span className={`${styles.dot} ${dotClass}`} />
			<span className={styles.label}>{label}</span>
			<span className={styles.divider} />
			<span className={styles.counts}>
				{counts.hosts} hosts · {counts.services} service types · {counts.instances} instances · {counts.ips} addresses
			</span>
			<span className={styles.spacer} />
			<span className={styles.counts}>{updated}</span>
		</>
	);
}
