import { Tooltip } from "@radix-ui/themes";
import { toggleLive } from "../lib/commands";
import { PauseBars, PlayTriangle } from "../lib/icons";
import { ageLabel, staleness } from "../lib/presence";
import { useDiscoveryStore } from "../store/discoveryStore";
import styles from "./LiveToggle.module.css";

export function LiveToggle() {
	const status = useDiscoveryStore((s) => s.status);
	const now = useDiscoveryStore((s) => s.now);
	const pausedAt = useDiscoveryStore((s) => s.pausedAt);
	const pausedAgeS = status.live || pausedAt === 0 ? 0 : Math.floor((now - pausedAt) / 1000);
	const stale = staleness(status.live, pausedAgeS);
	const dotClass = status.live ? styles.dotLive : stale === "stale" ? styles.dotStale : styles.dotPaused;
	return (
		<Tooltip content={status.live ? "Pause discovery" : "Resume discovery"}>
			<button type="button" className={styles.toggle} onClick={() => void toggleLive()}>
				<span className={`${styles.dot} ${dotClass}`} />
				<span className={styles.label}>{status.live ? "Live" : "Paused"}</span>
				{!status.live && <span className={styles.age}>{ageLabel(pausedAgeS)}</span>}
				{status.live ? <PauseBars /> : <PlayTriangle />}
			</button>
		</Tooltip>
	);
}
