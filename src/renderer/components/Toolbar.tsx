import { IconButton, SegmentedControl, Tooltip } from "@radix-ui/themes";
import { rescan } from "../lib/commands";
import { Refresh } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";
import { AppearanceMenu } from "./AppearanceMenu";
import { BeaconLockup } from "./brand/BrandLockup";
import { ExportMenu } from "./ExportMenu";
import { LiveToggle } from "./LiveToggle";
import { SearchField } from "./SearchField";
import styles from "./Toolbar.module.css";
import { ViewMenu } from "./ViewMenu";

const SEGMENTS: { value: Lens; label: string }[] = [
  { value: "service", label: "Services" },
  { value: "host", label: "Hosts" },
  { value: "ip", label: "IPs" },
  { value: "all", label: "All" },
];

export function Toolbar() {
  const mode = useSettingsStore((s) => s.mode);
  const setMode = useSettingsStore((s) => s.setMode);
  const scanning = useDiscoveryStore((s) => s.status.scanning);
  return (
    <>
      <div className={styles.leading}>
        <LiveToggle />
        <SegmentedControl.Root
          size="1"
          variant="classic"
          value={mode}
          onValueChange={(v) => setMode(v as Lens)}
          className="bcn-no-drag"
        >
          {SEGMENTS.map((s) => (
            <SegmentedControl.Item key={s.value} value={s.value}>
              {s.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </div>
      <BeaconLockup />
      <div className={styles.trailing}>
        <SearchField />
        <Tooltip content="Rescan network">
          <IconButton variant="ghost" size="2" aria-label="Rescan network" onClick={() => void rescan()}>
            <span className={`${styles.refreshIcon}${scanning ? ` ${styles.spin}` : ""}`}>
              <Refresh />
            </span>
          </IconButton>
        </Tooltip>
        <ViewMenu />
        <AppearanceMenu />
        <ExportMenu />
      </div>
    </>
  );
}
