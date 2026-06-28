import { ClearX } from "../lib/icons";
import { useDiscoveryStore } from "../store/discoveryStore";
import styles from "./PermissionBanner.module.css";

export function PermissionBanner() {
	const show = useDiscoveryStore((s) => s.permissionHint);
	const dismiss = useDiscoveryStore((s) => s.dismissPermissionHint);
	if (!show) return null;
	return (
		<div className={styles.banner} role="alert">
			<span className={styles.text}>
				No local-network responses yet. If devices are missing, Beacon may need Local Network access.
			</span>
			<button
				type="button"
				className={`${styles.action} bcn-no-drag`}
				onClick={() => void window.beacon.openLocalNetworkSettings()}
			>
				Open Settings
			</button>
			<button type="button" className={`${styles.close} bcn-no-drag`} aria-label="Dismiss" onClick={dismiss}>
				<ClearX />
			</button>
		</div>
	);
}
