import { Tooltip } from "@radix-ui/themes";
import { toggleLive } from "../lib/commands";
import { PauseBars, PlayTriangle } from "../lib/icons";
import { discoveryPhase, useDiscoveryStore } from "../store/discoveryStore";
import styles from "./LiveToggle.module.css";

export function LiveToggle() {
  const phase = useDiscoveryStore(discoveryPhase);
  if (phase === "connecting") {
    // Nothing to toggle until main reports its state; don't guess Live or Paused.
    return (
      <button type="button" className={styles.toggle} disabled>
        <span className={`${styles.dot} ${styles.dotPaused}`} />
        <span className={styles.label}>Connecting…</span>
      </button>
    );
  }
  const live = phase === "live";
  return (
    <Tooltip content={live ? "Pause discovery" : "Resume discovery"}>
      <button type="button" className={styles.toggle} onClick={() => void toggleLive()}>
        <span className={`${styles.dot} ${live ? styles.dotLive : styles.dotPaused}`} />
        <span className={styles.label}>{live ? "Live" : "Paused"}</span>
        {live ? <PauseBars /> : <PlayTriangle />}
      </button>
    </Tooltip>
  );
}
