import { useMemo } from "react";
import { lensCounts, visibleInstances } from "../lib/selectors";
import { discoveryPhase, useDiscoveryStore } from "../store/discoveryStore";
import { useSettingsStore } from "../store/settingsStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  const hosts = useDiscoveryStore((s) => s.hosts);
  const instances = useDiscoveryStore((s) => s.instances);
  const query = useDiscoveryStore((s) => s.query);
  const phase = useDiscoveryStore(discoveryPhase);
  const now = useDiscoveryStore((s) => s.now);
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

  const dotClass = phase === "live" ? styles.dotLive : styles.dotPaused;
  const label = { connecting: "Connecting…", live: "Live", paused: "Paused" }[phase];
  const updated = { connecting: "", live: "Updated just now", paused: "Snapshot paused" }[phase];

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
