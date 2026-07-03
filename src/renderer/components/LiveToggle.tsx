import { Tooltip } from "@radix-ui/themes";
import { toggleLive } from "../lib/commands";
import { PauseBars, PlayTriangle } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import styles from "./LiveToggle.module.css";

export function LiveToggle() {
	const status = useDiscoveryStore((s) => s.status);
	const dotClass = status.live ? styles.dotLive : styles.dotPaused;
	return (
		<Tooltip content={status.live ? "Pause discovery" : "Resume discovery"}>
			<button type="button" className={styles.toggle} onClick={() => void toggleLive()}>
				<span className={`${styles.dot} ${dotClass}`} />
				<span className={styles.label}>{status.live ? "Live" : "Paused"}</span>
				{status.live ? <PauseBars /> : <PlayTriangle />}
			</button>
		</Tooltip>
	);
}
