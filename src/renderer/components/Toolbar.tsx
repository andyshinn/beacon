import { Button, IconButton, SegmentedControl, Tooltip } from "@radix-ui/themes";
import { rescan } from "../lib/commands";
import { Download, Refresh, Sun } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import { type Lens, useSettingsStore } from "../store/settingsStore";
import { LiveToggle } from "./LiveToggle";
import { SearchField } from "./SearchField";
import styles from "./Toolbar.module.css";

const SEGMENTS: { value: Lens; label: string }[] = [
	{ value: "service", label: "Services" },
	{ value: "host", label: "Hosts" },
	{ value: "ip", label: "IPs" },
	{ value: "all", label: "All" },
];

export function Toolbar() {
	const mode = useSettingsStore((s) => s.mode);
	const setMode = useSettingsStore((s) => s.setMode);
	const toggleAppearance = useSettingsStore((s) => s.toggleAppearance);
	const scanning = useDiscoveryStore((s) => s.status.scanning);
	return (
		<>
			<div className={styles.logoBlock}>
				<div className="bcn-logo" />
				<span className="bcn-title" title="mDNS / Bonjour browser">
					Beacon
				</span>
			</div>
			<LiveToggle />
			<SegmentedControl.Root size="1" value={mode} onValueChange={(v) => setMode(v as Lens)} className={styles.segmented}>
				{SEGMENTS.map((s) => (
					<SegmentedControl.Item key={s.value} value={s.value}>
						{s.label}
					</SegmentedControl.Item>
				))}
			</SegmentedControl.Root>
			<div className={styles.spacer} />
			<SearchField />
			<Tooltip content="Rescan network">
				<IconButton variant="ghost" size="2" aria-label="Rescan network" onClick={() => void rescan()}>
					<span className={scanning ? styles.spin : undefined}>
						<Refresh />
					</span>
				</IconButton>
			</Tooltip>
			{/* TODO(Task 7): <ViewMenu /> */}
			<Tooltip content="Toggle appearance">
				<IconButton variant="ghost" size="2" aria-label="Toggle appearance" onClick={() => toggleAppearance()}>
					<Sun />
				</IconButton>
			</Tooltip>
			{/* TODO(Task 7): <ExportMenu />, replacing this placeholder button */}
			<Button color="indigo" variant="solid" size="2">
				<Download />
				Export
			</Button>
		</>
	);
}
